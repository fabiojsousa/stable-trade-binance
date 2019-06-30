const binance = require('./binance')
const controllers = require("./controllers");

/*===============Para Ajustar os preços compra/venda que deseja===============*/
const ajusteCompra = 0.002
const ajustVenda = 0.003
/*============================================================================*/

let availableUSDT = "loading...";
let estimatedTotalUSDT = 0;
const mercados = ["TUSDUSDT", "USDCUSDT", "USDSUSDT", "PAXUSDT"];

const minimumTrade = 10
let percentualLucro = "loading...";
let btcChangePercent = "loading...";
let btcPrice = "loading...";

/*Na primeira execução não há tempo de espera, nas demais o tempo é definido no final do código no
setTimeout que chamará novamente a função.*/
(async function repeat(){
  console.clear();
  
  //Estabelece um preço dinâmico de compra e venda
  let [compra, venda] = await controllers.getBestPrice(ajusteCompra, ajustVenda, mercados)

  console.log(
    `Compra: ${compra} | Venda: ${venda} => Lucro: ${percentualLucro}%
    \nBTC 24h change: ${btcChangePercent}%\nBTC Price: ${btcPrice}
    \nUSDT Disponível: ${availableUSDT}\nUSDT Total Estimado: ${estimatedTotalUSDT}
    \nSaldo\t\t\tÚltimo Preço\tOrdem Aberta`
  );

  //Iniciar análise do mercado para efetuar os traders
  for (let i in mercados) {
    try{
      let prevDay = await binance.getPrice(mercados[i]),
      balances = await binance.getBalance(),
      openOrders = await binance.openOrders(),
      depth = await binance.getDepth(mercados[i]),
      prevDayBTC = await binance.getPrice("BTCUSDT")

      btcChangePercent = prevDayBTC.priceChangePercent;
      btcPrice = parseFloat(prevDayBTC.lastPrice).toFixed(2)
      percentualLucro = (((venda - compra) * 100) / venda).toFixed(2);

      availableUSDT = parseFloat(balances.USDT.available);
      estimatedTotalUSDT = controllers.calcularSaldo(balances, openOrders);

      /*Irá analisar se há algum saldo >= ao minimumTrade estabelecido. Em caso
      positivo retonará qual é o par da moeda a ser feito a venda*/
      let moedaParaVender = controllers.discoverCoinToSell(balances, minimumTrade);

      /*Irá analisar o livro de vendas para saber se há alguma ordem <= ao valor 
      de compra estabelecido. Se houver alguma ordem, irá verificar se o montante
      dela é maior que o saldo total de USDT disponível, em caso positivo irá realizar
      a compra da ordem com o valor total de USDT disponível, em caso negativo, irá
      comprar apenas o montante da ordem. O retorno é um array com os seguintes dados:
      
      0 - Verdadeiro ou falso. Caso haja alguma ordem <= ao valor de compra.
      1 - O montante a ser feito a compra.
      2 - O preço que deve ser feito a compra.*/
      let [
        buyBoolean, 
        buyAmount, 
        buyPrice] = controllers.timeTobuy(depth.asks, compra, availableUSDT)

      /*minimumTrade é um valor mínimo que é considerado para efetuar as operações. A compra
      só acontece se haver no livro uma ordem de venda <= ao valor de compra estabelecido.*/
      if (availableUSDT > minimumTrade && buyBoolean) {
        try {
          //o total precisa ter até duas casas decimais, o preço precisa ter até 4 casas decimais
          binance.buy(mercados[i], buyAmount, buyPrice)

          controllers.sendMail(
            `Ordem de compra em ${mercados[i]} colocada!<br><br>
            Preço de compra estipulado: ${compra}<br>
            Preço de compra considerado nesta ordem: ${buyPrice}<br>
            Montante: ${buyAmount}<br>
            Total estimado USDT: ${estimatedTotalUSDT}<br>
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
        moedaParaVender === mercados[i].replace("USDT", "")
      ) {
        /*O montante é necessário está apenas com duas casas decimais, toFixed(2) arredonda
        o último valor, sendo necessário subtrair 0.01 para que o montante não fique
        acima do saldo real total disponível.*/
        let balanceVenda = (parseFloat(balances[moedaParaVender].available) - 0.01).toFixed(2);

        try {
          binance.sell(mercados[i], balanceVenda, venda);

          controllers.sendMail(
            `Ordem de venda em ${mercados[i]} colocada!<br><br>
            Preço de venda: ${venda}<br>
            Total posto a venda: ${balanceVenda}<br>
            Último preço do ${mercados[i]}: ${prevDay.lastPrice}<br>
            Total estimado USDT: ${estimatedTotalUSDT}<br><br>
            Livro de compras (bids):<br>${controllers.formatarLivro(depth.bids)}`
          );
        } catch (e) {
          controllers.sendMail(`Erro ao tentar colocar a ordem de venda. Erro: ${e}`);
        }
      }
      controllers.showOpenOrders(
        mercados[i], 
        balances[mercados[i].replace("USDT", "")].available,
        prevDay.lastPrice,
        openOrders
      )
      
    }
    catch(e){
      console.log(`Something went wrong.
      Msg: ${e.message}`)
    }
  }
  setTimeout(repeat, 2000)
})()
