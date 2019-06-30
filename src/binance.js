const crypto = require('crypto');
const axios = require('axios')
const config = require('./config.json')

const {apiKey, secretKey} = config

//Add header with apiKey for all requests
axios.defaults.headers.common['X-MBX-APIKEY'] = apiKey

//Add baseUrl for all requests
axios.defaults.baseURL = 'https://api.binance.com'

class Requests{

  async openOrders(){
    //Endpoint description: Get all open orders on a symbol.
    const path = '/api/v3/openOrders'

    //parameters required for this request
    let requestParams = {
      timestamp: new Date().getTime()
    }
    requestParams["signature"] = getSignature(requestParams)

    const response = await axios.get(path, {
      params: requestParams
    })
    
    return response.data
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

    const response = await axios.get(path, {
      params: requestParams
    })

    //The response.data.balances comes in array, this for turns the array in an object with all assets
    for (let obj of response.data.balances) 
      balances[obj.asset] = { available: obj.free, onOrder: obj.locked }

    return balances
  }

  async getPrice(symbol){
    //Endpoint description: 24 hour rolling window price change statistics.
    const path = '/api/v1/ticker/24hr'

    const response = await axios.get(path, {
      params: {symbol}
    })
    
    return response.data
  }

  async getDepth(symbol){
    /*Endpoint description: Could be adjusted using the parameter limit. 
    Default 100; max 1000. Valid limits:[5, 10, 20, 50, 100, 500, 1000]*/
    const path = '/api/v1/depth'

    let bids = {}, asks = {}, obj;

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
    console.log(`Something went wrong:
    Status: ${e.response.data.code}
    Msg: ${e.response.data.msg}`)
  }
}


module.exports = new Requests()