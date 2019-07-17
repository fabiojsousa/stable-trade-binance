const binance = require('./binance')
const controllers = require("./controllers");

/*===============Para Ajustar os preços compra/venda que deseja===============*/
const ajusteCompra = 0.002
const ajustVenda = 0.003
/*============================================================================*/
const topoMaximo = 1.008

let availableUSDT = "loading...";
let estimatedTotalUSDT = "loading...";
const mercados = ["TUSDUSDT", "USDCUSDT", "USDSUSDT", "PAXUSDT"];

const minimumTrade = 12
let percentualLucro = "loading..."
let btcChangePercent = "loading..."
let btcPrice = "loading...", compra="loading...", venda="loading...";

/*Na primeira execução não há tempo de espera, nas demais o tempo é definido no final do código no
setTimeout que chamará novamente a função.*/
(async function repeat(){
  console.clear();
  console.log(
    `BTC 24h change: ${btcChangePercent}%\nBTC Price: ${btcPrice}
    \nUSDT Disponível: ${availableUSDT}\nUSDT Total Estimado: ${estimatedTotalUSDT}
    \nSaldo\t\t\tCompra\tVenda\t%Lucro\tÚltimo Preço\tOrdem Aberta`
  );

  //Iniciar análise do mercado para efetuar os traders
  for (let i in mercados) {
    try{
      //Estabelece um preço dinâmico de compra e venda
      let [bestBuy, bestSell] = await controllers.getBestPrice(ajusteCompra, ajustVenda, mercados, i, topoMaximo)
      
      compra = bestBuy, venda = bestSell

      let prevDay = await binance.getPrice(mercados[i]),
      balances = await binance.getBalance(),
      depth = await binance.getDepth(mercados[i]),
      prevDayBTC = await binance.getPrice("BTCUSDT");
      
      /**
       * Para não estourar a cota de solicitações por minutos da API, as requisições das ordens abertas
       * são feitas individualmente para cada moeda, desta forma a requisição tem peso 1, se solicitar
       * todas as ordens abertas a requisição tem peso 40.
       */
      let openOrders = []
      for(let k in mercados){
        let arrOpenOrders = await binance.openOrders(mercados[k])

        if(arrOpenOrders.length > 0)
          for(let l in arrOpenOrders)
            openOrders.push(arrOpenOrders[l]) 
      }

      btcChangePercent = prevDayBTC.priceChangePercent;
      btcPrice = parseFloat(prevDayBTC.lastPrice).toFixed(2);
      percentualLucro = (((venda - compra) * 100) / venda).toFixed(2);

      availableUSDT = parseFloat(balances.USDT.available);
      estimatedTotalUSDT = controllers.calcularSaldo(balances, openOrders);

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
        buyPrice] = controllers.timeTobuy(depth.asks, compra, availableUSDT);

      /*minimumTrade é um valor mínimo que é considerado para efetuar as operações. A compra
      só acontece se haver no livro uma ordem de venda <= ao valor de compra estabelecido.*/
      if (availableUSDT > minimumTrade && buyBoolean) {
        try {
          //o total precisa ter até duas casas decimais, o preço precisa ter até 4 casas decimais
          binance.buy(mercados[i], buyAmount, buyPrice)

          //Atualizar os valores após a compra
          balances = await binance.getBalance();
          openOrders = await binance.openOrders();
          availableUSDT = parseFloat(balances.USDT.available);
          estimatedTotalUSDT = controllers.calcularSaldo(balances, openOrders);

          //Verficar qual foi a moeda comprada para efetuar a venda logo em seguida
          moedaParaVender = controllers.discoverCoinToSell(balances, minimumTrade);

          controllers.sendMail(
            `Ordem de COMPRA em ${mercados[i]} colocada!<br><br>
            Preço estipulado: ${compra}<br>
            Preço considerado: ${buyPrice}<br>
            Montante: ${buyAmount}<br>
            USDT Disponível: ${availableUSDT}<br>
            USDT Total Estimado: ${estimatedTotalUSDT}<br>
            Último preço em ${mercados[i]}: ${prevDay.lastPrice}<br><br>
            Livro de vendas (asks):<br>${controllers.formatarLivro(depth.asks)}`
          );
        } catch (e) {
          controllers.sendMail(`Erro ao tentar colocar a ordem de compra. Erro: ${e}`);
        }
      } if (
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

          //Atualizar os valores para enviar corretamente no e-mail
          balances = await binance.getBalance();
          openOrders = await binance.openOrders();
          availableUSDT = parseFloat(balances.USDT.available);
          estimatedTotalUSDT = controllers.calcularSaldo(balances, openOrders);

          controllers.sendMail(
            `Ordem de VENDA em ${mercados[i]} colocada!<br><br>
            Preço estipulado: ${venda}<br>
            Montante: ${balanceVenda}<br>
            USDT Disponível: ${availableUSDT}<br>
            USDT Total Estimado: ${estimatedTotalUSDT}<br>
            Último preço em ${mercados[i]}: ${prevDay.lastPrice}<br><br>
            Livro de compras (bids):<br>${controllers.formatarLivro(depth.bids)}`
          );
        } catch (e) {
          controllers.sendMail(`Erro ao tentar colocar a ordem de venda. Erro: ${e}`);
        }
      }
      controllers.showOpenOrders(
        mercados[i], 
        balances[mercados[i].replace("USDT", "")].available,
        compra,
        venda,
        percentualLucro,
        prevDay.lastPrice,
        openOrders
      )
      
    }
    catch(e){
      console.log("Something went wrong: " +e)
    }
  }
  setTimeout(repeat, 1000)
})()
