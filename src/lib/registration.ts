import { parseImageDataUrl } from "@/lib/image";
import { NATIONALITIES } from "@/lib/countries";

export {
  NATIONALITIES,
  DIAL_CODES,
  DEFAULT_DIAL_CODE,
  combineMobile,
  splitMobile,
  findDialCode,
} from "@/lib/countries";

export type { NationalityOption, DialCodeOption } from "@/lib/countries";

export const NATIONALITY_NAMES = NATIONALITIES.map((n) => n.name);

/** Minimum bill amount (QAR) required to register or save a guest. */
export const MIN_TRANSACTION_VALUE = 200;

export type RegistrationInput = {
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
  nationality: string;
  address_zone: string;
  transaction_date: string;
  company_id: string;
  transaction_value: number;
};

/** Accept a data URL or raw base64 JPEG/PNG string for the bill photo. */
export function parseReceiptImage(raw: unknown) {
  return parseImageDataUrl(raw, "Bill photo");
}

export function validateRegistration(body: Partial<RegistrationInput>) {
  const errors: string[] = [];
  const first_name = body.first_name?.trim() ?? "";
  const last_name = body.last_name?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const mobile = body.mobile?.trim() ?? "";
  const nationality = body.nationality?.trim() ?? "";
  const address_zone = body.address_zone?.trim() ?? "";
  const transaction_date = body.transaction_date?.trim() ?? "";
  const company_id = body.company_id?.trim() ?? "";
  const transaction_value = Number(body.transaction_value);

  if (!first_name) errors.push("First name is required");
  if (!last_name) errors.push("Last name is required");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Valid email is required");
  }
  // Full E.164-style number including ISD; need enough digits overall
  if (!mobile || mobile.replace(/\D/g, "").length < 8) {
    errors.push("Valid mobile number is required");
  }
  if (!nationality) errors.push("Nationality is required");
  if (!address_zone) errors.push("Location is required");
  if (!transaction_date || Number.isNaN(Date.parse(transaction_date))) {
    errors.push("Transaction date is required");
  }
  if (!company_id) errors.push("Store name is required");
  if (!Number.isFinite(transaction_value) || transaction_value < 0) {
    errors.push("Transaction value must be a valid amount");
  } else if (transaction_value < MIN_TRANSACTION_VALUE) {
    errors.push(`Transaction value must be ${MIN_TRANSACTION_VALUE} QAR or more`);
  }

  return {
    errors,
    data: {
      first_name,
      last_name,
      email: email.toLowerCase(),
      mobile,
      nationality,
      address_zone,
      transaction_date,
      company_id,
      transaction_value,
    } satisfies RegistrationInput,
  };
}

export function formatQar(amount: number) {
  return new Intl.NumberFormat("en-QA", {
    style: "currency",
    currency: "QAR",
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Booth / mall local calendar day (Asia/Qatar). */
export const BOOTH_TIME_ZONE = "Asia/Qatar";

/** YYYY-MM-DD for a calendar day in the booth timezone (default Asia/Qatar). */
export function todayISODate(timeZone: string = BOOTH_TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Shift a YYYY-MM-DD calendar date by `days` (date-only arithmetic, no TZ drift). */
export function shiftISODate(isoDate: string, days: number) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days));
  const yyyy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(utc.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Default admin lookback so older booth-day receipts still appear on open. */
export function defaultRegistrationsFromDate(timeZone: string = BOOTH_TIME_ZONE) {
  return shiftISODate(todayISODate(timeZone), -30);
}
