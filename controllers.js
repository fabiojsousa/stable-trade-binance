const nodemailer = require("nodemailer");
const config = require("./config.json");
const binance = require("node-binance-api");

class MainControllers {
  sendMail(message) {
    // async..await is not allowed in global scope, must use a wrapper
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
          user: config.user, // generated ethereal user
          pass: config.pass // generated ethereal password
        }
      });

      // send mail with defined transport object
      let info = await transporter.sendMail({
        from: "Bot de trader USDT - Binance", // sender address
        to: config.user, // list of receivers
        subject: "Trade efetuado", // Subject line
        html: `<b>${message}</b>` // html body
      });

      console.log("Message sent: %s", info.messageId);

      console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    }

    main().catch(console.error);
  }

  formatarLivro(livro) {
    return JSON.stringify(livro).replace(/,/g, "<br>");
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

  userAuth() {
    return binance().options({
      APIKEY: config.API_KEY,
      APISECRET: config.SECRET_KEY,
      useServerTime: true
    });
  }

  timeTobuy(depthAsks, sellPrice, balanceUSDT){
    const orderBookSell = Object.keys(depthAsks)

    for(let i in orderBookSell)
      if(orderBookSell[i]<=sellPrice){
        if(depthAsks[orderBookSell[i]]>=balanceUSDT)
          return [true, (balanceUSDT - 0.01).toFixed(2), (orderBookSell[i] - 0.0001).toFixed(4)]
        else
          return [true, (depthAsks[orderBookSell[i]] - 0.01).toFixed(2), (orderBookSell[i] - 0.0001).toFixed(4)]
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
}

module.exports = new MainControllers();