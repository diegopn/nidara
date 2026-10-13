const PERIOD_YEARS = Object.freeze({ "1": 1, "2": 2, "5": 5, "10": 10 });

export function publicationDateRange(period, yearFrom = "", yearTo = "", today = new Date()) {
  if (period === "custom") {
    return {
      fromDate: yearFrom ? `${yearFrom}-01-01` : "",
      toDate: yearTo ? `${yearTo}-12-31` : ""
    };
  }

  const years = PERIOD_YEARS[period];
  if (!years) return { fromDate: "", toDate: "" };

  const endYear = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const day = today.getUTCDate();
  const startYear = endYear - years;
  const startDay = Math.min(day, new Date(Date.UTC(startYear, month + 1, 0)).getUTCDate());
  const fromDate = new Date(Date.UTC(startYear, month, startDay)).toISOString().slice(0, 10);
  const toDate = new Date(Date.UTC(endYear, month, day)).toISOString().slice(0, 10);
  return { fromDate, toDate };
}
