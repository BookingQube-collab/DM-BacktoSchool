/** Nationalities with flag emoji for registration combobox. */
export type NationalityOption = {
  name: string;
  flag: string;
};

/** Dial codes with flag for mobile ISD selector. */
export type DialCodeOption = {
  name: string;
  flag: string;
  dial: string;
};

export const DEFAULT_DIAL_CODE = "+974";

export const NATIONALITIES: NationalityOption[] = [
  { name: "Qatari", flag: "🇶🇦" },
  { name: "Emirati", flag: "🇦🇪" },
  { name: "Saudi", flag: "🇸🇦" },
  { name: "Kuwaiti", flag: "🇰🇼" },
  { name: "Bahraini", flag: "🇧🇭" },
  { name: "Omani", flag: "🇴🇲" },
  { name: "Indian", flag: "🇮🇳" },
  { name: "Pakistani", flag: "🇵🇰" },
  { name: "Bangladeshi", flag: "🇧🇩" },
  { name: "Filipino", flag: "🇵🇭" },
  { name: "Nepali", flag: "🇳🇵" },
  { name: "Sri Lankan", flag: "🇱🇰" },
  { name: "Egyptian", flag: "🇪🇬" },
  { name: "Jordanian", flag: "🇯🇴" },
  { name: "Lebanese", flag: "🇱🇧" },
  { name: "Syrian", flag: "🇸🇾" },
  { name: "Palestinian", flag: "🇵🇸" },
  { name: "Iraqi", flag: "🇮🇶" },
  { name: "Yemeni", flag: "🇾🇪" },
  { name: "Iranian", flag: "🇮🇷" },
  { name: "Turkish", flag: "🇹🇷" },
  { name: "Moroccan", flag: "🇲🇦" },
  { name: "Tunisian", flag: "🇹🇳" },
  { name: "Algerian", flag: "🇩🇿" },
  { name: "Sudanese", flag: "🇸🇩" },
  { name: "Kenyan", flag: "🇰🇪" },
  { name: "Nigerian", flag: "🇳🇬" },
  { name: "South African", flag: "🇿🇦" },
  { name: "Chinese", flag: "🇨🇳" },
  { name: "Japanese", flag: "🇯🇵" },
  { name: "Korean", flag: "🇰🇷" },
  { name: "Indonesian", flag: "🇮🇩" },
  { name: "Malaysian", flag: "🇲🇾" },
  { name: "Thai", flag: "🇹🇭" },
  { name: "Vietnamese", flag: "🇻🇳" },
  { name: "Singaporean", flag: "🇸🇬" },
  { name: "British", flag: "🇬🇧" },
  { name: "Irish", flag: "🇮🇪" },
  { name: "French", flag: "🇫🇷" },
  { name: "German", flag: "🇩🇪" },
  { name: "Italian", flag: "🇮🇹" },
  { name: "Spanish", flag: "🇪🇸" },
  { name: "Portuguese", flag: "🇵🇹" },
  { name: "Dutch", flag: "🇳🇱" },
  { name: "Belgian", flag: "🇧🇪" },
  { name: "Swiss", flag: "🇨🇭" },
  { name: "Swedish", flag: "🇸🇪" },
  { name: "Norwegian", flag: "🇳🇴" },
  { name: "Danish", flag: "🇩🇰" },
  { name: "Polish", flag: "🇵🇱" },
  { name: "Romanian", flag: "🇷🇴" },
  { name: "Greek", flag: "🇬🇷" },
  { name: "Russian", flag: "🇷🇺" },
  { name: "Ukrainian", flag: "🇺🇦" },
  { name: "American", flag: "🇺🇸" },
  { name: "Canadian", flag: "🇨🇦" },
  { name: "Mexican", flag: "🇲🇽" },
  { name: "Brazilian", flag: "🇧🇷" },
  { name: "Argentine", flag: "🇦🇷" },
  { name: "Australian", flag: "🇦🇺" },
  { name: "New Zealander", flag: "🇳🇿" },
  { name: "Other", flag: "🌍" },
];

/** Common ISD codes — Qatar first as default market. */
export const DIAL_CODES: DialCodeOption[] = [
  { name: "Qatar", flag: "🇶🇦", dial: "+974" },
  { name: "United Arab Emirates", flag: "🇦🇪", dial: "+971" },
  { name: "Saudi Arabia", flag: "🇸🇦", dial: "+966" },
  { name: "Kuwait", flag: "🇰🇼", dial: "+965" },
  { name: "Bahrain", flag: "🇧🇭", dial: "+973" },
  { name: "Oman", flag: "🇴🇲", dial: "+968" },
  { name: "India", flag: "🇮🇳", dial: "+91" },
  { name: "Pakistan", flag: "🇵🇰", dial: "+92" },
  { name: "Bangladesh", flag: "🇧🇩", dial: "+880" },
  { name: "Philippines", flag: "🇵🇭", dial: "+63" },
  { name: "Nepal", flag: "🇳🇵", dial: "+977" },
  { name: "Sri Lanka", flag: "🇱🇰", dial: "+94" },
  { name: "Egypt", flag: "🇪🇬", dial: "+20" },
  { name: "Jordan", flag: "🇯🇴", dial: "+962" },
  { name: "Lebanon", flag: "🇱🇧", dial: "+961" },
  { name: "Syria", flag: "🇸🇾", dial: "+963" },
  { name: "Palestine", flag: "🇵🇸", dial: "+970" },
  { name: "Iraq", flag: "🇮🇶", dial: "+964" },
  { name: "Yemen", flag: "🇾🇪", dial: "+967" },
  { name: "Iran", flag: "🇮🇷", dial: "+98" },
  { name: "Turkey", flag: "🇹🇷", dial: "+90" },
  { name: "Morocco", flag: "🇲🇦", dial: "+212" },
  { name: "Tunisia", flag: "🇹🇳", dial: "+216" },
  { name: "Algeria", flag: "🇩🇿", dial: "+213" },
  { name: "Sudan", flag: "🇸🇩", dial: "+249" },
  { name: "Kenya", flag: "🇰🇪", dial: "+254" },
  { name: "Nigeria", flag: "🇳🇬", dial: "+234" },
  { name: "South Africa", flag: "🇿🇦", dial: "+27" },
  { name: "China", flag: "🇨🇳", dial: "+86" },
  { name: "Japan", flag: "🇯🇵", dial: "+81" },
  { name: "South Korea", flag: "🇰🇷", dial: "+82" },
  { name: "Indonesia", flag: "🇮🇩", dial: "+62" },
  { name: "Malaysia", flag: "🇲🇾", dial: "+60" },
  { name: "Thailand", flag: "🇹🇭", dial: "+66" },
  { name: "Vietnam", flag: "🇻🇳", dial: "+84" },
  { name: "Singapore", flag: "🇸🇬", dial: "+65" },
  { name: "United Kingdom", flag: "🇬🇧", dial: "+44" },
  { name: "Ireland", flag: "🇮🇪", dial: "+353" },
  { name: "France", flag: "🇫🇷", dial: "+33" },
  { name: "Germany", flag: "🇩🇪", dial: "+49" },
  { name: "Italy", flag: "🇮🇹", dial: "+39" },
  { name: "Spain", flag: "🇪🇸", dial: "+34" },
  { name: "Portugal", flag: "🇵🇹", dial: "+351" },
  { name: "Netherlands", flag: "🇳🇱", dial: "+31" },
  { name: "Belgium", flag: "🇧🇪", dial: "+32" },
  { name: "Switzerland", flag: "🇨🇭", dial: "+41" },
  { name: "Sweden", flag: "🇸🇪", dial: "+46" },
  { name: "Norway", flag: "🇳🇴", dial: "+47" },
  { name: "Denmark", flag: "🇩🇰", dial: "+45" },
  { name: "Poland", flag: "🇵🇱", dial: "+48" },
  { name: "Romania", flag: "🇷🇴", dial: "+40" },
  { name: "Greece", flag: "🇬🇷", dial: "+30" },
  { name: "Russia", flag: "🇷🇺", dial: "+7" },
  { name: "Ukraine", flag: "🇺🇦", dial: "+380" },
  { name: "United States", flag: "🇺🇸", dial: "+1" },
  { name: "Canada", flag: "🇨🇦", dial: "+1" },
  { name: "Mexico", flag: "🇲🇽", dial: "+52" },
  { name: "Brazil", flag: "🇧🇷", dial: "+55" },
  { name: "Argentina", flag: "🇦🇷", dial: "+54" },
  { name: "Australia", flag: "🇦🇺", dial: "+61" },
  { name: "New Zealand", flag: "🇳🇿", dial: "+64" },
];

/** Match longest dial prefix first so +970 wins over +97… etc. */
const DIAL_BY_LENGTH = [...DIAL_CODES].sort(
  (a, b) => b.dial.length - a.dial.length,
);

export function findDialCode(fullMobile: string): DialCodeOption {
  const normalized = fullMobile.trim().replace(/[\s()-]/g, "");
  const withPlus = normalized.startsWith("+")
    ? normalized
    : normalized
      ? `+${normalized}`
      : "";
  for (const option of DIAL_BY_LENGTH) {
    if (withPlus.startsWith(option.dial)) return option;
  }
  return DIAL_CODES.find((d) => d.dial === DEFAULT_DIAL_CODE)!;
}

export function splitMobile(fullMobile: string): {
  dial: string;
  local: string;
} {
  const trimmed = fullMobile.trim().replace(/[\s()-]/g, "");
  if (!trimmed) {
    return { dial: DEFAULT_DIAL_CODE, local: "" };
  }
  const option = findDialCode(trimmed);
  const withPlus = trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
  if (withPlus.startsWith(option.dial)) {
    return {
      dial: option.dial,
      local: withPlus.slice(option.dial.length).replace(/\D/g, ""),
    };
  }
  return {
    dial: DEFAULT_DIAL_CODE,
    local: trimmed.replace(/\D/g, ""),
  };
}

export function combineMobile(dial: string, local: string): string {
  const digits = local.replace(/\D/g, "");
  if (!digits) return "";
  return `${dial}${digits}`;
}
