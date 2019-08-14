const crypto = require('crypto');
const axiosModule = require('axios')
const config = require('./config.json')

const {apiKey, secretKey} = config

const axios = axiosModule.create({
  baseURL: 'https://api.binance.com',
  timeout: 10000,
  headers: {'X-MBX-APIKEY': apiKey}
})

class Requests{

  async openOrders(symbol){
    //Endpoint description: Get all open orders on a symbol.
    const path = '/api/v3/openOrders'

    //parameters required for this request
    let requestParams = {
      timestamp: new Date().getTime(),
      symbol
    }
    requestParams["signature"] = getSignature(requestParams)

    try{
      const response = await axios.get(path, {
        params: requestParams
      })
      
      return response.data
    }
    catch(e){
      showError(e, "openOrders")
    }
    
  }

  async getBalance(){
    //Endpoint description: Get current account information.
    const path = '/api/v3/account'

    let balances = {};

    //parameters required for this request
    let requestParams = {
      timestamp: new Date().getTime(),
    }
    requestParams["signature"] = getSignature(requestParams)

    try{
      const response = await axios.get(path, {
        params: requestParams
      })
  
      //The response.data.balances comes in array, this for turns the array in an object with all assets
      for (let obj of response.data.balances) 
        balances[obj.asset] = { available: obj.free, onOrder: obj.locked }
  
      return balances
    }
    catch(e){
      showError(e, "getBalance")
    }
  }

  async getPrice(symbol){
    //Endpoint description: 24 hour rolling window price change statistics.
    const path = '/api/v1/ticker/24hr'

    try{
      const response = await axios.get(path, {
        params: {symbol}
      })
      
      return response.data
    }
    catch(e){
      showError(e, "getPrice")
    }
  }

  async getCandleData(symbol, lastCandle){
    //Endpoint description: Kline/candlestick bars for a symbol. Klines are uniquely identified by their open time.
    const path = '/api/v1/klines'

    let candle = ["openTime", "open", "high", "low", "close", "volume", "closeTime", "quoteAssetVolume", "numberOfTrades",
      "takerBuyBaseAssetVolume", "takerBuyQuoteAssetVolume", "ignore"], candleData = {}, data, myParams;

    for(let i in candle)
      candleData[candle[i]]=[]

    let lastHour = new Date().getUTCHours()-1

    if(lastCandle){
      myParams = {
        symbol,
        interval: "1h",
        startTime: new Date().setUTCHours(lastHour-1,0,0),
        endTime: new Date().setUTCHours(lastHour,0,0)
      }
    }
    else
      myParams = {
        symbol,
        interval: "30m",
        limit: 1000
      }

    try{
      const response = await axios.get(path, {
        params: myParams
      })
      
      data = response.data

      for (let i=0; i < data.length; i++)
        for(let j=0; j < data[i].length; j++)
          candleData[candle[j]].push(data[i][j])

      return candleData

    }catch(e){
      showError(e, "getCandleData")
    }
  }

  async getTradesList(symbol){
    //Endpoint description: Get recent trades (up to last 500).
    const path = '/api/v1/trades'

    //parameters required for this request
    let requestParams = {
      symbol,
      limit: 100
    }

    try{
      const response = await axios.get(path, {
        params: requestParams
      })

      return response.data

    }catch(e){
      showError(e, "getTradesList")
    }
  }
  
  async getDepth(symbol){
    /*Endpoint description: Could be adjusted using the parameter limit. 
    Default 100; max 1000. Valid limits:[5, 10, 20, 50, 100, 500, 1000]*/
    const path = '/api/v1/depth'

    let bids = {}, asks = {}, obj;

    try{
      const response = await axios.get(path, {
        params: {symbol}
      })
  
      for (obj of response.data.bids) {
        bids[obj[0]] = parseFloat(obj[1]);
      }
      
      for (obj of response.data.asks){
        asks[obj[0]] = parseFloat(obj[1])
      }
                  
      return { bids: bids, asks: asks }
    }
    catch(e){
      showError(e, "getDepth")
    }
  }

  buy(symbol, quantity, price){
    execOrder(symbol, quantity, price, 'BUY')
  }

  sell(symbol, quantity, price){
    execOrder(symbol, quantity, price, 'SELL')
  }

}

function getSignature(msg){
  let msgObj = Object.keys(msg), requestParamsString = ''

  for(let i in msgObj){
    if(i==msgObj.length-1)
      requestParamsString += `${msgObj[i]}=${msg[msgObj[i]]}`
    else
      requestParamsString += `${msgObj[i]}=${msg[msgObj[i]]}&`
  }
  
  const hash = crypto.createHmac('sha256', secretKey)
                   .update(requestParamsString)
                   .digest('hex')
  
  return hash
}

async function execOrder(symbol, quantity, price, side){
  //Endpoint description: Send in a new order.*/
  const path = '/api/v3/order'

  //parameters required for this request
  let requestParams = {
    symbol,
    side,
    type: 'LIMIT',
    quantity,
    price,
    timeInForce: 'GTC',
    timestamp: new Date().getTime(),
  }
  requestParams["signature"] = getSignature(requestParams)

  try{
    const response = await axios({
      method: 'post',
      url: path,
      params: requestParams
    })

    console.log(response)
  }
  catch(e){
    showError(e, "execOrder")
  }
}

function showError(e, request){
  console.log(`${request}: Something went wrong.
    Status: ${e.response.data.code}
    Msg: ${e.response.data.msg}`)
}


module.exports = new Requests()