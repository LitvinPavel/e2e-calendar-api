const express = require("express");
const PORT = process.env.PORT || 5000;
const axios = require("axios");
const { parse, stringify } = require("qs");
const NodeCache = require("node-cache");

const app = express();

const myCache = new NodeCache();
const CACHE_KEY = "CACHE_KEY";

const xmlcalendar = axios.create({
  baseURL: "http://xmlcalendar.ru/data/ru",
  paramsSerializer: {
    encode: parse,
    serialize: stringify,
  },
});

function getMonthData(data, month) {
  return {
    year: data.year,
    months: data.months.filter((m) => +m.month === +month),
  };
}

function getTotalDays(year, month) {
  const monthLength = new Date(year, month, 0).getDate();
  return [...Array(monthLength)].map((_, i) => ++i);
}

function getPart(year, month, days, isLast) {
  const totalDays = getTotalDays(year, month);
  const partDays = isLast ? totalDays.slice(15) : totalDays.slice(0, 15);
  const holyDays = days.split(",").map((s) => +s.replace(/\D/g, ""));
  return {
    part: partDays.filter((d) => !holyDays.includes(d)),
    total: totalDays.filter((d) => !holyDays.includes(d)),
  };
}

function formatCalendar({ year, months }) {
  if (!year && !months && !months.length) return null;
  let newMonths = [];

  for (let i = 1; i < months.length; i++) {
    const { month: currMonth, days: currDays } = months[i] || {};
    const { month: prevMonth, days: prevDays } = months[i - 1] || [];
    const totalDays = getTotalDays(year, currMonth);
    newMonths[i - 1] = {
      month: currMonth,
      totalDays,
      prevWorkDays: getPart(
        prevMonth === 0 ? +year - 1 : year,
        prevMonth,
        prevDays,
        true
      ),
      currentWorkDays: getPart(year, currMonth, currDays, false),
    };
  }
  return {
    year,
    months: newMonths,
  };
}

function getLastMonth({ months }) {
  if (months && months.length) {
    return {
      ...months[months.length - 1],
      month: 0,
    };
  } else {
    return {};
  }
}

async function fetchCalendar(year) {
  try {
    if (!year) return null;
    let cachedData = myCache.get(CACHE_KEY) || {};
    let data = {};
    if (!cachedData[year]) {
      const response = await xmlcalendar.get(`${year}/calendar.json`);

      data = response.data || {};
      if (Object.keys(data).length) {
        myCache.set(CACHE_KEY, { [year]: data });
      }
    } else {
      console.log("cachedData", cachedData);
      data = await cachedData[year];
    }
    return data;
  } catch ({ response }) {
    console.error(response.status);
    return null;
  }
}

app
  .get("/getYearData", async (req, res, next) => {
    try {
      const { year, month } = req.query || {};
      if (!year) res.status(404).send("Not found");
      const [data, data2] = await Promise.all([
        fetchCalendar(year),
        fetchCalendar(+year - 1),
      ]);
      if (!data) res.status(404).send("Not found");

      const yearData = {
        year: data.year,
        months: [getLastMonth(data2), ...data.months],
      };

      const monthData = month
        ? getMonthData(yearData, month)
        : formatCalendar(yearData);

      res.set("Access-Control-Allow-Origin", "*").send(monthData);
    } catch (err) {
      next(err);
    }
  })
  .listen(PORT, () => console.log(`Listening on ${PORT}`));

module.exports = app;