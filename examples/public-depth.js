/* eslint-disable */

import Indodax from 'indodax-rx'

const generateStream = (pair) => {
  return Indodax.getTradeDepth(pair)
    .map((depth) => {
      if (!Object.prototype.hasOwnProperty.call(depth, 'buy')) {
        return { latestPrice: new Decimal(0), sellPrice: new Decimal(0), stream: 'vip-btcidr' }
      }
      const price = new Decimal(depth.sell[0][0])
      const sellPrice = new Decimal(depth.buy[0][0])
      return { latestPrice: price, sellPrice, stream: 'vip-btcidr' }
    })
    .catch(() => {
      return Rx.Observable.of({})
    })
}

const pairsToMonitor = [
  'btc_idr',
  'ten_idr',
]

const monitor = Rx.Observable.interval(30000)
  .startWith(0)
  .switchMap(() => Rx.Observable.zip(...pairsToMonitor.map(pair => generateStream(pair))))

monitor.subscribe(
  stream => console.log(stream),
  err => console.error(err.stack),
)
