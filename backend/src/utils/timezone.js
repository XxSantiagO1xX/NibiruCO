const VALID_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
];

/**
 * Obtiene la clave en minúsculas del día de la semana para la zona horaria dada.
 * En modo desarrollo/testing permite override mediante req.query.override_day o x-override-day.
 */
function getBusinessDayKey(overrideDay = null, timezone = "America/Mexico_City") {
  if (process.env.NODE_ENV !== "production" && overrideDay) {
    const cleanOverride = String(overrideDay).trim().toLowerCase();
    if (VALID_DAYS.includes(cleanOverride)) {
      return cleanOverride;
    }
  }

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long"
    });
    return formatter.format(new Date()).toLowerCase();
  } catch (err) {
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    return days[new Date().getDay()];
  }
}

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD en la zona horaria del negocio.
 */
function getBusinessDateStr(timezone = "America/Mexico_City") {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return formatter.format(new Date());
  } catch (err) {
    return new Date().toISOString().slice(0, 10);
  }
}

module.exports = {
  VALID_DAYS,
  getBusinessDayKey,
  getBusinessDateStr
};
