
/* eslint-disable */

import Indodax from 'indodax-rx'

const client = new Indodax('aNAP1k3y', 'An4p15ecR3T')

const monitor = client.listenSpotPrice('btcidr')
  .do((data) => {
    const highestBuy = data.buy[0][0]
    console.log(`[BTCIDR] Highest Buy Price: Rp ${highestBuy}`)
  })

monitor.subscribe(
  stream => console.log(stream),
  err => console.error(err.stack),
)
