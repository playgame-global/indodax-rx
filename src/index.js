import qs from 'querystring'
import request from 'request-promise-native'
import WebSocket from 'ws'
import Rx from 'rxjs/Rx'
import crypto from 'crypto'
import constants from './constants'

const WS_URL = constants.websocketUrl

const MINIMUM_VOLUMES = {
  btcidr: {
    buy: 50000,
    sell: 0.0001,
    pip: 1000,
  },
  bchidr: {
    buy: 50000,
    sell: 0.0001,
    pip: 1000,
  },
  btgidr: {
    buy: 50000,
    sell: 0.0001,
    pip: 1000,
  },
  ethidr: {
    buy: 50000,
    sell: 0.01,
    pip: 1000,
  },
  etcidr: {
    buy: 50000,
    sell: 0.01,
    pip: 100,
  },
  ignisidr: {
    buy: 50000,
    sell: 0.01,
    pip: 1,
  },
  ltcidr: {
    buy: 50000,
    sell: 0.01,
    pip: 1000,
  },
  nxtidr: {
    buy: 50000,
    sell: 5,
    pip: 1,
  },
  tenidr: {
    buy: 50000,
    sell: 0.01,
    pip: 1,
  },
  stridr: {
    buy: 50000,
    sell: 20,
    pip: 1,
  },
  xrpidr: {
    buy: 50000,
    sell: 5,
    pip: 1,
  },
  wavesidr: {
    buy: 50000,
    sell: 0.01,
    pip: 100,
  },
  xzcidr: {
    buy: 50000,
    sell: 0.01,
    pip: 100,
  },
  ethbtc: {
    buy: 0.001,
    sell: 0.001,
  },
  ltcbtc: {
    buy: 0.01,
    sell: 0.01,
  },
  nxtbtc: {
    buy: 0.01,
    sell: 0.01,
  },
  strbtc: {
    buy: 0.01,
    sell: 0.01,
  },
  xrpbtc: {
    buy: 0.01,
    sell: 0.01,
  },
}

class Indodax {
  constructor(apiKey, apiSecret) {
    this.ws = new WebSocket(WS_URL)
    this.apiKey = apiKey
    this.apiSecret = apiSecret
    this.MINIMUM_VOLUMES = MINIMUM_VOLUMES

    this.messages = Rx.Observable
      .create((messageObserver) => {
        this.ws.on('message', (data) => {
          if (!messageObserver.closed) {
            messageObserver.next(data)
          }
        })
      })
      .share()

    this.isExecutingTrade = false
    this.isConnected = false
  }

  connect() {
    return Rx.Observable.create((observer) => {
      if (this.isConnected && !observer.closed) {
        observer.next(() => {})
      } else {
        this.ws.on('open', () => {
          this.isConnected = true
          if (!observer.closed) {
            observer.next(() => {})
          }
        })
      }
    })
      .observeOn(Rx.Scheduler.asap)
  }

  listen(channel) {
    const msg = `{"event":"pusher:subscribe","data":{"channel":"tradedata-${channel}"}}`
    this.ws.send(msg)

    return this.messages
      .map((message) => {
        const messageObj = JSON.parse(message)
        return messageObj
      })
  }

  listenSpotPrice(channel) {
    const subscribeArgs = channel
    return this.listen(subscribeArgs)
      .filter(message => message.event === 'update')
      .filter(message => message.channel === `tradedata-${subscribeArgs}`)
      .map(message => JSON.parse(message.data))
      .filter(data => Object.keys(data).length > 0)
      .map((data) => {
        const minimums = MINIMUM_VOLUMES[subscribeArgs]
        const buy = data.buy_orders
          .map(x => [x.price, x[Object.keys(x)[1]]])
          .filter(x => x[1] > minimums.buy)
        const sell = data.sell_orders
          .map((x) => {
            const crypt = subscribeArgs
            const btcIdrPrice = parseFloat(data.prices.btcidr)

            const price = crypt.endsWith('btc') ? parseFloat(x.price) / 100000000.0
              : parseFloat(x.price)
            const volume = crypt.endsWith('btc') ? parseFloat(x[Object.keys(x)[1]]) / btcIdrPrice
              : parseFloat(x[Object.keys(x)[1]]) / price
            return [price, volume]
          })
          .filter(x => x[1] > minimums.sell)
        return {
          buy,
          sell,
        }
      })
  }

  trade(pair, type, price, amount) {
    if (this.isExecutingTrade) {
      return Rx.Observable.throw(new Error('Cannot trade while there is a trade ongoing'))
    }

    this.isExecutingTrade = true

    const params = {
      pair: pair.toLowerCase(),
      type,
      price: String(price),
    }
    const currencies = pair.toLowerCase().split('_')
    if (type === 'buy') {
      params[currencies[1]] = String(amount)
    } else if (type === 'sell') {
      params[currencies[0]] = String(amount)
    }

    try {
      return Indodax.sendVipTapiCommand(this.apiKey, this.apiSecret, 'trade', params)
    } catch (err) {
      return Rx.Observable.throw(err)
    } finally {
      this.isExecutingTrade = false
    }
  }

  getInfo() {
    return Indodax.sendVipTapiCommand(this.apiKey, this.apiSecret, 'getInfo')
      .catch((err) => {
        console.log(err.stack)
        return Rx.Observable.throw(err)
      })
  }

  getIdrBalance() {
    return this.getInfo()
      .map(res => res.balance.idr)
  }

  getCryptoBalance(symbol) {
    return this.getInfo()
      .map(res => parseFloat(res.balance[symbol]))
  }

  getOpenOrders() {
    return Indodax.sendVipTapiCommand(this.apiKey, this.apiSecret, 'openOrders')
  }

  getOrder(pair, orderId) {
    return Indodax.sendVipTapiCommand(this.apiKey, this.apiSecret, 'getOrder', { pair, order_id: orderId })
  }

  cancelOrder(pair, orderId, type) {
    return Indodax.sendVipTapiCommand(this.apiKey, this.apiSecret, 'cancelOrder', { pair, order_id: orderId, type })
  }

  static getCandles(pair, period, count, shift = false) {
    const secondsPassed = shift ? period * (count + 1) * 60 : period * count * 60
    const timeNow = Math.floor(Date.now() / 1000)
    const timeFrom = timeNow - secondsPassed
    const realPair = pair.replace('_', '').replace('STR', 'XLM')
    const url = `${constants.indodaxTradingViewBaseUrl}/history?symbol=${realPair}&resolution=${period}&from=${timeFrom}&to=${timeNow}`
    const rp = request.get(url).promise()
    return Rx.Observable.fromPromise(rp)
      .map(it => JSON.parse(it))
      .map((it) => {
        if (shift) {
          it.o.shift()
          it.h.shift()
          it.l.shift()
          it.c.shift()
        }
        return {
          open: it.o,
          high: it.h,
          low: it.l,
          close: it.c,
        }
      })
      .catch((err) => {
        console.log(err.stack)
        return Rx.Observable.throw(err)
      })
  }

  static sign(postBody, apiSecret) {
    return crypto.createHmac('sha512', apiSecret).update(qs.stringify(postBody)).digest('hex')
  }

  static sendVipTapiCommand(apiKey, apiSecret, method, params) {
    const postBody = params === undefined ? {
      method,
      nonce: new Date().getTime(),
    } : {
      method,
      ...params,
      nonce: new Date().getTime(),
    }
    const headers = {
      Key: apiKey,
      Sign: Indodax.sign(postBody, apiSecret),
    }
    const reqOpts = {
      url: constants.indodaxTapiBaseUrl,
      headers,
    }

    return Rx.Observable.fromPromise(request.post(reqOpts).form(postBody).promise())
      .observeOn(Rx.Scheduler.asap)
      .map(x => JSON.parse(x))
      .switchMap((response) => {
        return response.success === 1 ?
          Rx.Observable.of(response.return) :
          Rx.Observable.throw(new Error(JSON.stringify(response)))
      })
      .catch((err) => {
        console.log(err.stack)
        return Rx.Observable.throw(err)
      })
  }

  static getTradeDepth(pair) {
    const url = `${constants.indodaxApiBaseUrl}/${pair}/depth`
    const reqOpts = {
      url,
    }
    return Rx.Observable.fromPromise(request.post(reqOpts).promise())
      .observeOn(Rx.Scheduler.asap)
      .map(data => JSON.parse(data))
      .catch((err) => {
        console.log(err.stack)
        return Rx.Observable.throw(err)
      })
  }

  static getTicker(pair) {
    const url = `${constants.indodaxApiBaseUrl}/${pair.toLowerCase().replace('str', 'idr')}/ticker`
    const reqOpts = {
      url,
      headers: {
        'User-Agent': constants.defaultUserAgent,
      },
      method: 'GET',
    }
    const rp = request(reqOpts).promise()
    return Rx.Observable.fromPromise(rp)
      .observeOn(Rx.Scheduler.asap)
      .map(data => JSON.parse(data))
      .catch((err) => {
        console.log(err.stack)
        return Rx.Observable.throw(err)
      })
  }

  static getLatestPrice(pair) {
    return Indodax.getTicker(pair)
      .map(res => res.ticker.last)
  }

  static getLatestBuyPrice(pair) {
    return Indodax.getTicker(pair)
      .map(res => res.ticker.buy)
  }

  static getLatestSellPrice(pair) {
    return Indodax.getTicker(pair)
      .map(res => res.ticker.sell)
  }

  static getOHLCData(pair, timeframeInMinutes) {
    const endTime = Math.floor(new Date() / 1000)
    const startTime = endTime - (60 * 60 * 24)
    const url = `${constants.indodaxTradingViewBaseUrl}/history?symbol=${pair}&resolution=${timeframeInMinutes}&from=${startTime}&to=${endTime}`
    const reqOpts = {
      url,
      headers: {
        'User-Agent': constants.defaultUserAgent,
      },
      method: 'GET',
    }

    const rp = request(reqOpts).promise()
    return Rx.Observable.fromPromise(rp)
      .observeOn(Rx.Scheduler.asap)
      .map(data => JSON.parse(data))
      .map((data) => {
        const res = data
        res.pair = pair
        return res
      })
      .catch((err) => {
        console.log(err.stack)
        return Rx.Observable.throw(err)
      })
  }
}

export default Indodax
