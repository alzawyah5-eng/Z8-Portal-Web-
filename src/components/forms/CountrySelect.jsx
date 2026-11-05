import ResponsiveSelect from "@/components/forms/ResponsiveSelect";
import { COUNTRIES } from "@/lib/countries";

// Alphabetical, so a client scrolls names instead of guessing a code.
// Stored value stays the ISO 3166-1 alpha-2 code the backend expects.
const OPTIONS = [...COUNTRIES]
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((country) => ({
    value: country.code,
    dial: country.dial,
    name: country.name,
  }));

/**
 * Country picker. showDial adds the international calling code to each entry,
 * for picking the country of a mobile number.
 */
export default function CountrySelect({ value, onValueChange, placeholder = "Select a country", showDial = false, id, className }) {
  const options = OPTIONS.map((country) => ({
    value: country.value,
    label: showDial && country.dial ? `${country.name} (+${country.dial})` : country.name,
  }));

  return (
    <ResponsiveSelect
      id={id}
      value={value}
      onValueChange={onValueChange}
      options={options}
      placeholder={placeholder}
      className={className}
    />
  );
}