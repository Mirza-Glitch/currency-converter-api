import express from "express";
import cors from "cors";
import cheerio from "cheerio";
import fetch from "node-fetch";
import bigDecimal from "js-big-decimal";
import cache from "memory-cache";
import rateLimit from "express-rate-limit";
import currencyList from "./currencyList.js";

const app = express();
var port = process.env.PORT || 3000;
let cacheTimeOut = 30 * 60 * 1000;
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // minutes * seconds * milliseconds
  max: 450, // 450 = 7.5 minutes of use
  message: { 
    status: 429,
    result: false,
    message: "Too many requests"
  },
});
app.use(cors());
app.use(express.json());
app.use(limiter);

app.get('/', (req, res)=>{
  res.sendFile('index.html',{
    root: './'
  })
})

app.get('/logo.png', (req, res)=>{
  res.sendFile('logo.png',{
    root: './'
  })
})

app.get("/convert", async (req, res) => {
  let { from, to, amount } = req.query;
  let xy = [from.toLowerCase(), to.toLowerCase()].sort();
  let x_y = xy.join("-");
  if (!Number.isInteger(Number(amount))) {
    return res.json({
      status: 400,
      result: false,
      message: "conversion amount must be an Integer",
    });
  }
  if (xy[0] == xy[1]) {
    return res.json({
      status: 400,
      result: false,
      message: "From and To currency cannot be same",
    });
  }
  if (
    !currencyList.includes(from.toUpperCase()) ||
    !currencyList.includes(to.toUpperCase())
  ) {
    return res.json({
      status: 400,
      result: false,
      message:
        "invalid currency code, or the currency code doesn't exist in database",
    });
  }
  if (cache.get(x_y)) {
    let myCache = cache.get(x_y);
    let parsedCache = JSON.parse(myCache);
    let queryFrom = x_y.split("-");
    let cachedArr = [parsedCache[1], parsedCache[0]];
    if (queryFrom[0] == from.toLowerCase()) {
      [cachedArr[0], cachedArr[1]] = [parsedCache[0], parsedCache[1]];
    }
    let responseObj = convertRates(cachedArr, amount, parsedCache[2]);
    return res.json(responseObj);
  }
  try {
    let response = await fetch(
      `https://www.forbes.com/advisor/money-transfer/currency-converter/${from.toLowerCase()}-${to.toLowerCase()}/`
    );
    let data = await response.text();
    let arr = [];
    let $ = await cheerio.load(data);
    let $rate = $("div .result-box .result-box-c1-c2 div");
    $rate.each((i, e) => {
      arr.push($(e).text());
    });
    cache.put(x_y, JSON.stringify([...arr, Date.now()]), cacheTimeOut);
    let responseObj = convertRates(arr, amount);
    res.json(responseObj);
  } catch (e) {
    console.log(e, "Error occured while fetching and working on data");
    res.json({
      status: 500,
      result: false,
      message: "There was an error while fetching/working on data.",
    });
  }
});

function convertRates(arr, amount, prevTime) {
  let slicedStr = (arr) => {
    let newArr = arr.map((val, i) => {
      let n = val.indexOf("\n");
      return val.slice(0, n);
    });
    let rateArr = newArr.map((val, i) => {
      let isEq = val.indexOf("= ");
      let currency_amount = val.slice(0, isEq);
      let conversion_rate = val.slice(isEq + 2, val.length);
      return { currency_amount, conversion_rate };
    });
    return {
      from: rateArr[0],
      to: rateArr[1],
    };
  };
  let conversion = slicedStr(arr);
  let rateOfConvertion = conversion.from.conversion_rate;
  let parsedRate = Number(rateOfConvertion);
  var finalAmount = bigDecimal.multiply(parsedRate, amount);
  let resObj = {
    status: 200,
    result: true,
    conversion,
    amount,
    final_converted_amount: finalAmount,
    last_updated_unix_timestamp: prevTime || Date.now(),
  };
  return resObj;
}

app.listen(port, () => {
  console.log(`server started on port ${port}`);
});
