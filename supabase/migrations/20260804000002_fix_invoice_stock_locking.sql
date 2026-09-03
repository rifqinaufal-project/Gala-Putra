-- Replace the invoice-stock trigger query that joins a DISTINCT result before
-- FOR UPDATE, which PostgreSQL rejects with SQLSTATE 0A000.
CREATE OR REPLACE FUNCTION public.apply_invoice_stock_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_row RECORD;
  balance_row public.stock_balances%ROWTYPE;
  requested_quantity NUMERIC;
  available_quantity NUMERIC;
  product_name_value TEXT;
  actor_name TEXT;
  change_direction TEXT;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status IN ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE') THEN
    change_direction := 'OUT';
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'DRAFT' AND NEW.status IN ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE') THEN
    change_direction := 'OUT';
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'VOID' AND OLD.status NOT IN ('DRAFT', 'VOID') THEN
    change_direction := 'RETURN';
  ELSE
    RETURN NEW;
  END IF;

  IF change_direction = 'OUT' THEN
    IF EXISTS (
      SELECT 1 FROM public.stock_movements
      WHERE invoice_id = NEW.id AND movement_type = 'SALE_OUT'
    ) THEN
      RETURN NEW;
    END IF;

    IF EXISTS (SELECT 1 FROM public.invoice_items WHERE invoice_id = NEW.id AND product_id IS NULL) THEN
      RAISE EXCEPTION 'Invoice memiliki produk yang sudah tidak tersedia';
    END IF;

    INSERT INTO public.stock_balances(product_id)
    SELECT DISTINCT product_id FROM public.invoice_items
    WHERE invoice_id = NEW.id AND product_id IS NOT NULL
    ON CONFLICT (product_id) DO NOTHING;

    -- EXISTS locks every affected balance row once, without DISTINCT.
    PERFORM sb.product_id
    FROM public.stock_balances sb
    WHERE EXISTS (
      SELECT 1
      FROM public.invoice_items ii
      WHERE ii.invoice_id = NEW.id AND ii.product_id = sb.product_id
    )
    ORDER BY sb.product_id
    FOR UPDATE;

    SELECT p.name, sb.quantity, req.requested_quantity
    INTO product_name_value, available_quantity, requested_quantity
    FROM public.stock_balances sb
    JOIN public.products p ON p.id = sb.product_id
    JOIN (
      SELECT product_id, SUM(quantity) AS requested_quantity
      FROM public.invoice_items
      WHERE invoice_id = NEW.id
      GROUP BY product_id
    ) req ON req.product_id = sb.product_id
    WHERE sb.quantity < req.requested_quantity
    ORDER BY sb.product_id
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION 'Stok % tidak cukup. Tersedia %, dibutuhkan %', product_name_value, available_quantity, requested_quantity;
    END IF;

    SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
    FOR item_row IN
      SELECT ii.*, p.name AS current_product_name, p.default_unit AS current_unit,
             NEW.customer_id AS invoice_customer_id
      FROM public.invoice_items ii
      JOIN public.products p ON p.id = ii.product_id
      WHERE ii.invoice_id = NEW.id
      ORDER BY ii.product_id, ii.id
    LOOP
      UPDATE public.stock_balances
      SET quantity = quantity - item_row.quantity, updated_at = NOW()
      WHERE product_id = item_row.product_id
      RETURNING * INTO balance_row;

      INSERT INTO public.stock_movements(
        product_id, product_name_snapshot, unit, movement_type, quantity_delta,
        balance_after, customer_id, invoice_id, invoice_item_id, notes, occurred_at, created_by
      ) VALUES (
        item_row.product_id, item_row.description_snapshot, item_row.unit,
        'SALE_OUT', -item_row.quantity, balance_row.quantity, item_row.invoice_customer_id,
        NEW.id, item_row.id, COALESCE(NEW.invoice_number, 'Invoice'), NEW.issue_date, auth.uid()
      );
    END LOOP;

    INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
    VALUES (auth.uid(), COALESCE(actor_name, 'User'), 'invoices', NEW.id, 'STOCK_SALE_OUT',
      jsonb_build_object('invoice_number', NEW.invoice_number));
  ELSE
    IF EXISTS (
      SELECT 1 FROM public.stock_movements
      WHERE invoice_id = NEW.id AND movement_type = 'INVOICE_VOID_RETURN'
    ) THEN
      RETURN NEW;
    END IF;

    PERFORM sb.product_id
    FROM public.stock_balances sb
    WHERE EXISTS (
      SELECT 1
      FROM public.stock_movements sm
      WHERE sm.invoice_id = NEW.id
        AND sm.movement_type = 'SALE_OUT'
        AND sm.product_id = sb.product_id
    )
    ORDER BY sb.product_id
    FOR UPDATE;

    SELECT full_name INTO actor_name FROM public.profiles WHERE id = auth.uid();
    FOR item_row IN
      SELECT sm.*, p.name AS current_product_name
      FROM public.stock_movements sm
      JOIN public.products p ON p.id = sm.product_id
      WHERE sm.invoice_id = NEW.id AND sm.movement_type = 'SALE_OUT'
      ORDER BY sm.product_id, sm.id
    LOOP
      UPDATE public.stock_balances
      SET quantity = quantity + ABS(item_row.quantity_delta), updated_at = NOW()
      WHERE product_id = item_row.product_id
      RETURNING * INTO balance_row;

      INSERT INTO public.stock_movements(
        product_id, product_name_snapshot, unit, movement_type, quantity_delta,
        balance_after, customer_id, invoice_id, invoice_item_id, notes, occurred_at, created_by
      ) VALUES (
        item_row.product_id, item_row.product_name_snapshot, item_row.unit,
        'INVOICE_VOID_RETURN', ABS(item_row.quantity_delta), balance_row.quantity,
        item_row.customer_id, NEW.id, item_row.invoice_item_id, 'Pengembalian invoice dibatalkan', NOW(), auth.uid()
      );
    END LOOP;

    INSERT INTO public.audit_logs(user_id, user_name, entity_name, entity_id, action, payload)
    VALUES (auth.uid(), COALESCE(actor_name, 'User'), 'invoices', NEW.id, 'STOCK_VOID_RETURN',
      jsonb_build_object('invoice_number', NEW.invoice_number));
  END IF;

  RETURN NEW;
END;
$$;
