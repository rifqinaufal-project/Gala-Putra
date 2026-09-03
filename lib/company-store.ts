export interface CompanyBankAccountInput {
  id?: string;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  isPrimary?: boolean;
}

export interface CompanyProfile {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  npwp: string;
  bankName: string;
  bankAccount: string;
  bankHolder: string;
  logoUrl?: string;
  bankAccounts?: CompanyBankAccountInput[];
}

export const defaultCompanyProfile: CompanyProfile = {
  name: "Gala Putra",
  address: "Jl. Pemasok Seafood No. 1, Jakarta Utara",
  phone: "021-XXXXXXXX",
  email: "email@mail.com",
  website: "www.website.id",
  npwp: "",
  bankName: "BCA",
  bankAccount: "1234567890",
  bankHolder: "Gala Putra",
  logoUrl: undefined,
  bankAccounts: [],
};

export const INDONESIAN_BANKS = [
  "BCA (Bank Central Asia)",
  "Bank Mandiri",
  "BNI (Bank Negara Indonesia)",
  "BRI (Bank Rakyat Indonesia)",
  "Bank Permata",
  "CIMB Niaga",
  "Bank Danamon",
  "BSI (Bank Syariah Indonesia)",
  "BTN (Bank Tabungan Negara)",
  "Panin Bank",
  "Bank Mega",
  "Maybank Indonesia",
];

const STORAGE_KEY = "sultan_seafood_company_profile";

export function getCompanyProfile(): CompanyProfile {
  if (typeof window === "undefined") return defaultCompanyProfile;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error("Failed to parse company profile:", e);
  }
  return defaultCompanyProfile;
}

export function saveCompanyProfile(profile: CompanyProfile) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.error("Failed to save company profile:", e);
  }
}
