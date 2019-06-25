const controllers = require("./controllers");

const binance = controllers.userAuth();

/*===============Para Ajustar os preços compra/venda que deseja===============*/
const ajusteCompra = 0.002
const ajustVenda = 0.003
/*============================================================================*/

let availableUSDT = "loading...";
let estimatedTotalUSDT = 0;
const mercados = ["TUSDUSDT", "USDCUSDT", "USDSUSDT", "PAXUSDT"];
let mediaPrecosMercados

const minimumTrade = 10
let compra, venda
let percentualLucro = "loading...";
let btcChangePercent = "loading...";
let btcPrice = "loading...";

const getBestPrice = () => new Promise ((resolve, reject)=>{
  mediaPrecosMercados = 0, compra = 0, venda = 0

  binance.prevDay("TUSDUSDT", (error, prevDayTUSD, prevDaySymbol) => {
    binance.prevDay("USDCUSDT", (error, prevDayUSDC, prevDaySymbol)=>{
      binance.prevDay("USDSUSDT", (error, prevDayUSDT, prevDaySymbol)=>{
        binance.prevDay("PAXUSDT", (error, prevDayPAX, prevDaySymbol)=>{
          mediaPrecosMercados = parseFloat(prevDayTUSD.prevClosePrice) + parseFloat(prevDayUSDC.prevClosePrice) +
                                parseFloat(prevDayUSDT.prevClosePrice) + parseFloat(prevDayPAX.prevClosePrice)

          mediaPrecosMercados = mediaPrecosMercados/mercados.length
          compra = mediaPrecosMercados - ajusteCompra
          venda = compra + ajustVenda

          compra = compra.toFixed(4)
          venda = venda.toFixed(4)
          resolve()
        })
      })
    }) 
  })
})

setInterval(()=>{
  console.clear();
    //Estabelece um preço dinâmico de compra e venda
    getBestPrice()
    .then(()=>{

      console.log(
        `Compra: ${compra} | Venda: ${venda} => Lucro: ${percentualLucro}%\n\nBTC 24h change: ${btcChangePercent}%\nBTC Price: ${btcPrice}
        \nUSDT Disponível: ${availableUSDT}\nTotal USDT Estimado: ${estimatedTotalUSDT}\n\nSaldo\t\t\tÚltimo Preço\tOrdem Aberta`
      );

      //Iniciar análise do mercado para efetuar os traders
      for (let i in mercados) {
        binance.prevDay(mercados[i], (error, prevDay, prevDaySymbol) => {
          binance.balance((error, balances) => {
            binance.openOrders(false, (error, openOrders, openOrdersSymbol) => {
              binance.depth(mercados[i], (error, depth, depthSymbol) => {
                binance.prevDay("BTCUSDT", (error, prevDayBTC, btcChangeSymbol) => {
                  try {
                    btcChangePercent = prevDayBTC.priceChangePercent;
                    btcPrice = parseFloat(prevDayBTC.lastPrice).toFixed(2)
                    percentualLucro = (((venda - compra) * 100) / venda).toFixed(2);
    
                    availableUSDT = parseFloat(balances.USDT.available);
                    estimatedTotalUSDT = controllers.calcularSaldo(balances, openOrders);
    
                    /*Irá analisar se há algum saldo >= ao minimumTrade estabelecido. Em caso
                    positivo retonará qual é o par da moeda a ser feito a venda*/
                    var moedaParaVender = controllers.discoverCoinToSell(balances, minimumTrade);
    
                    /*Irá analisar o livro de vendas para saber se há alguma ordem <= ao valor 
                    de compra estabelecido. Se houver alguma ordem, irá verificar se o montante
                    dela é maior que o saldo total de USDT disponível, em caso positivo irá realizar
                    a compra da ordem com o valor total de USDT disponível, em caso negativo, irá
                    comprar apenas o montante da ordem. O retorno é um array com os seguintes dados:
                    
                    0 - Verdadeiro ou falso. Caso haja alguma ordem <= ao valor de compra.
                    1 - O montante a ser feito a compra.
                    2 - O preço que deve ser feito a compra.*/
                    var [
                      buyBoolean, 
                      buyAmount, 
                      buyPrice] = controllers.timeTobuy(depth.asks, compra, availableUSDT)
    
                    /*minimumTrade é um valor mínimo que é considerado para efetuar as operações. A compra
                    só acontece se haver no livro uma ordem de venda <= ao valor de compra estabelecido.*/
                    if (availableUSDT > minimumTrade && buyBoolean) {
                      try {
                        //o total precisa ter até duas casas decimais, o preço precisa ter até 4 casas decimais
                        binance.buy(prevDaySymbol, buyAmount, buyPrice)
    
                        controllers.sendMail(
                          `Ordem de compra em ${mercados[i]} colocada!<br><br>
                          Preço de compra: ${buyPrice}<br>
                          Montante: ${buyAmount}<br>
                          Total USDT: ${estimatedTotalUSDT}<br>
                          Último preço em ${mercados[i]}: ${prevDay.lastPrice}<br><br>
                          Livro de vendas (asks):<br>${controllers.formatarLivro(depth.asks)}`
                        );
                      } catch (e) {
                        controllers.sendMail(`Erro ao tentar colocar a ordem de compra. Erro: ${e}`);
                      }
                    } else if (
                      /*moedaParaVender é descoberta no controller discoverCoinToSell, a venda só 
                      acontecerá se o loop do for estiver no mercado equivalente ao da moedaParaVender. 
                      A ordem de venda será colocada imediatamente de acordo com o valor 
                      de venda estipulado.*/
                      moedaParaVender === prevDaySymbol.replace("USDT", "")
                    ) {
                      /*O montante é necessário está apenas com duas casas decimais, toFixed(2) arredonda
                      o último valor, sendo necessário subtrair 0.01 para que o montante não fique
                      acima do saldo real total disponível.*/
                      let balanceVenda = (parseFloat(balances[moedaParaVender].available) - 0.01).toFixed(2);
    
                      try {
                        binance.sell(prevDaySymbol, balanceVenda, venda);
    
                        controllers.sendMail(
                          `Ordem de venda em ${mercados[i]} colocada!<br><br>
                          Preço de venda: ${venda}<br>
                          Total vendido: ${balanceVenda}<br>
                          Último preço do ${mercados[i]}: ${prevDay.lastPrice}<br>
                          Saldo USDT total: ${estimatedTotalUSDT}<br><br>
                          Livro de compras (bids):<br>${controllers.formatarLivro(depth.bids)}`
                        );
                      } catch (e) {
                        controllers.sendMail(`Erro ao tentar colocar a ordem de venda. Erro: ${e}`);
                      }
                    }
                    console.log(
                      `${mercados[i].replace("USDT", "")}: ${
                        balances[mercados[i].replace("USDT", "")].available
                      } \t ${prevDay.lastPrice} \t ${
                        openOrders.length > 0
                          ? openOrders[0].side +
                            " | Total: " +
                            openOrders[0].origQty +
                            " | Preço: " +
                            openOrders[0].price
                          : ""
                      }`
                    );
                  } catch (e) {
                    console.log(`Erro ao consultar a api da Binance. Erro: ${e}`);
                  }
                });
              });
            });
          });
        });
      }
    })
}, 8000)