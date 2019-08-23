const btsForEth = require('./btsForEth')
const ethForBts = require('./ethForBts')
const prompt = require('./helper/prompt')
const eth = require('./eth')
const bts = require('./bts')


async function main() {

  await sleep(2000)
  console.log('Enter 1 to send BTS get ETH');
  console.log('      2 to receive BTS from ETH');
  console.log('      3 to resolve BTS HTLC');
  console.log('      4 to resolve ETH HTLC');
  console.log('      5 to extend BTS HTLC');
  /* 
   * we don't have refund function in bitshares htlc contract,
   * the locked amount will return to depositor automatically when the timelock expires
   */
  let answer = await prompt('> ')
  switch (answer) {
    case '1':
      await btsForEth()
      break
    case '2':
      await ethForBts()
      break
    case '3':
      let ethHtlcId = await prompt('Enter the HTLC id you want to keep track on: ')
      let btsHtlcId = await prompt('Enter your BTS HTLC id: ')
      console.log('Waiting for ETH contract to be resolved...');
      await eth.waitForHTLC(ethHtlcId)
        .then(async function(secret) {
          let btsRecipient = await prompt('Enter your BTS account name: ')
          console.log("Resolving BTS HTLC contract...");
          const output = await bts.resolveHTLC(btsHtlcId, btsRecipient, secret)
          console.log(output);
        })
        .catch(async function(err) {
          console.log(err);
          let ethSender = await prompt('Enter your ETH sender address: ')
          console.log('Refunding ETH...');
          await eth.refundHTLC(ethSender, ethHtlcId)
        })
      break
    case '4':
      let ethRecipient = await prompt('Enter your ETH receiver address: ')
      let ethHtlcId = await prompt('Enter your ETH HTLC id: ')
      let secret = await prompt('Enter your preimage: ')
      console.log("Resolving ETH HTLC... ");
      await eth.resolveHTLC(ethRecipient, ethHtlcId, '0x' + Buffer.from(secret).toString('hex'))
      break
    case '5':
      let btsSender = await prompt('Enter your BTS account name: ')
      let btsHtlcId = await prompt('Enter BTS HTLC_id you want to extend: ')
      let Extratime = await prompt('Enter the extra time you need for contract (in seconds): ')
      let output = await bts.extendHTLC(btsSender, btsHtlcId, Extratime);
      console.log(output);
      break
  }
  process.exit()
}

main().catch(err => {
  console.log(err);
  process.exit(1)
})

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}