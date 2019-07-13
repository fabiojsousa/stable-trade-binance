const nodemailer = require("nodemailer")
const binance = require("./binance")
const config = require("./config")

class MainControllers {
  sendMail(message) {
    async function main() {
      // Generate test SMTP service account from ethereal.email
      // Only needed if you don't have a real mail account for testing
      let testAccount = await nodemailer.createTestAccount();

      // create reusable transporter object using the default SMTP transport
      let transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: config.user,
          pass: config.pass 
        }
      });

      // send mail with defined transport object
      let info = await transporter.sendMail({
        from: "Bot de trader USDT - Binance", // sender address
        to: "fjasousa2018@gmail.com", // list of receivers
        subject: "Trade efetuado", // Subject line
        html: `<b>${message}</b>` // html body
      });

      console.log("Message sent: %s", info.messageId);

      console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    }

    main().catch(console.error);
  }

  formatarLivro(livro) {
    return JSON.stringify(livro).replace(/,/g, ",<br>");
  }

  calcularSaldo(balances, saldoTotalUSDT) {
    if (saldoTotalUSDT == 0 || saldoTotalUSDT > 0) {
      saldoTotalUSDT = 0;
      saldoTotalUSDT =
        saldoTotalUSDT +
        parseFloat(balances.USDT.available) +
        parseFloat(balances.USDT.onOrder);

      return saldoTotalUSDT;
    }
  }

  timeTobuy(depthAsks, myBuyPrice, balanceUSDT){
    const orderBookSell = Object.keys(depthAsks)

    for(let i in orderBookSell)
      if(orderBookSell[i]<=myBuyPrice){
        if(depthAsks[orderBookSell[i]]>=balanceUSDT){
          let diferenca = balanceUSDT * orderBookSell[i] - balanceUSDT
          balanceUSDT = balanceUSDT - diferenca
          return [true, parseFloat(balanceUSDT - 0.01).toFixed(2) , orderBookSell[i]]
        }
        else
          return [true, depthAsks[orderBookSell[i]], orderBookSell[i]]
      }

    return [false,'','']
  }

  discoverCoinToSell(balances, minimumTrade){
    if (balances.TUSD.available > minimumTrade) return "TUSD";
    else if (balances.USDC.available > minimumTrade) return "USDC";
    else if (balances.USDS.available > minimumTrade) return "USDS";
    else if (balances.PAX.available > minimumTrade) return "PAX";
    else return "";
  }

  async getBestPrice(ajusteCompra, ajusteVenda, mercados, indice, topoMaximo){

    //1 - Last candle strategy
    //2 - prevClosePrice strategy
    //3 - Last 10 days strategy

    if(config.strategy === 1){
      
      let lastCandle = await binance.getCandleData(mercados[indice], true), compra, venda,
      mostRecentCandle = await binance.getCandleData(mercados[indice], false)
      
      if(lastCandle.close>=topoMaximo || lastCandle.close > mostRecentCandle.open){
        //Caso o preço esteja muito alto, 
        //Ou o fechamento do candle anterior seja maior que a abertura do candle atual.
        //=> Irá reduzir o preço de compra para evitar uma entrada muito alta.      
        compra = lastCandle.close - ajusteCompra*3
        venda = parseFloat(compra) + ajusteVenda
      }
      else{
        //melhor situação para compra e venda
        compra = lastCandle.close
        venda = parseFloat(compra) + ajusteVenda
      } 
        
      return [parseFloat(compra).toFixed(4), parseFloat(venda).toFixed(4)]
    
    } else if(config.strategy === 2){
      
      let mediaPrecosMercados = 0, compra = 0, venda = 0

      let prevDayTUSD = await binance.getPrice("TUSDUSDT"),
      prevDayUSDC = await binance.getPrice("USDCUSDT"),
      prevDayUSDT = await binance.getPrice("USDSUSDT"),
      prevDayPAX = await binance.getPrice("PAXUSDT")
      
      mediaPrecosMercados = parseFloat(prevDayTUSD.prevClosePrice) + parseFloat(prevDayUSDC.prevClosePrice) +
                            parseFloat(prevDayUSDT.prevClosePrice) + parseFloat(prevDayPAX.prevClosePrice)

      mediaPrecosMercados = mediaPrecosMercados/mercados.length

      compra = mediaPrecosMercados - ajusteCompra

      //Irá reduzir o preço de compra para evitar uma entrada muito alta.
      if(compra > topoMaximo)
        compra = mediaPrecosMercados - ajusteCompra*3

      venda = compra + ajusteVenda

      compra = compra.toFixed(4)
      venda = venda.toFixed(4)

      return [compra, venda]
    } else if(config.strategy === 3){
      //Basicamente irá verificar o preço dos últimos 3 dias para ajustar o topo máximo de compra.
    }

    
  }

  calcularSaldo(balances, openOrders) {
    let saldoUSDT = parseFloat(balances.USDT.available) + parseFloat(balances.USDT.onOrder)
    let totalOnSellOrder=0

    for(let i in openOrders){
      if(openOrders[i].side=="SELL")
        totalOnSellOrder = totalOnSellOrder + openOrders[i].price * openOrders[i].origQty
    }

    saldoUSDT = saldoUSDT + totalOnSellOrder

    return saldoUSDT
  }

  showOpenOrders(moeda, saldo, compra, venda, percentualLucro, lastPrice, openOrders){
    let moedaOpenOrders = []

    for(let i in openOrders)
      if(openOrders[i].symbol===moeda)
        moedaOpenOrders.push(openOrders[i])
    
    moeda = moeda.replace("USDT","")

    if(moeda.length<4)
      moeda= " "+moeda

    if(config.showAllOrders){
      console.log(`${moeda}: ${saldo}\t${compra}\t${venda}\t${percentualLucro}\t${lastPrice}\t${moedaOpenOrders.length > 0 ? 
        (()=>{
          let text = ""
          for(let i in moedaOpenOrders){
            if(moedaOpenOrders.length > 1){
              if(i == moedaOpenOrders.length -1){
                text += "\t\t\t\t\t\t\t\t" + moedaOpenOrders[i].side + " | Total: " + moedaOpenOrders[i].origQty + " | Preço: " + moedaOpenOrders[i].price
              }
              else
                text += moedaOpenOrders[i].side + " | Total: " + moedaOpenOrders[i].origQty + " | Preço: " + moedaOpenOrders[i].price + "\n"
              
            }
            else
              text += moedaOpenOrders[i].side + " | Total: " + moedaOpenOrders[i].origQty + " | Preço: " + moedaOpenOrders[i].price
          }
          return text
        })() : ""}`)
    }
    else{
      console.log(`${moeda}: ${saldo}\t${compra}\t${venda}\t${percentualLucro}\t${lastPrice}\t${moedaOpenOrders.length > 0 ? 
        moedaOpenOrders[0].side + " | Total: " + moedaOpenOrders[0].origQty + " | Preço: " +
        moedaOpenOrders[0].price : ""} ${moedaOpenOrders.length > 1 ? `[+${moedaOpenOrders.length-1}]` : ""}`)
    }
  }
}

module.exports = new MainControllers();
