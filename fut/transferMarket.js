/* globals
enums factories communication gUserModel models repositories services
*/
import { mean } from 'math-statistics';

import utils from './utils';
import priceTiers from './priceTiers';
import { Logger } from './logger';
import { PinEvent } from './pinEvent';
import { ListItemError } from './errors';

export class TransferMarket {
  _logger = new Logger();

  /* eslint-disable class-methods-use-this */
  async navigateToTransferHub() {
    await PinEvent.sendPageView('Hub - Transfers');
  }

  async navigateToTransferList() {
    await this.navigateToTransferHub();
    await PinEvent.sendPageView('Transfer List - List View');
  }
  /* eslint-enable class-methods-use-this */

  async searchMinBuy(item, itemsForMean = 3, lowUp = false) {
    services.Item.clearTransferMarketCache();

    this._logger.log(`Searching min buy for ${item.type} ${item._staticData.name} from low upward first ${lowUp}`, 'Core - Transfermarket');
    let minBuy = 0;

    if (lowUp) {
      minBuy = await this._findLowUp(item, itemsForMean);
      this._logger.log(`Low up search yielded ${minBuy} as a result`, 'Core - Transfermarket');
    }

    if (minBuy === 0) {
      this._logger.log('Searching low down...', 'Core - Transfermarket');
      minBuy = await this._findLowDown(item, itemsForMean);
    }

    if (minBuy === 0) {
      this._logger.log('No players found... it might be extinct', 'Core - Transfermarket');
    } else {
      this._logger.log(`Min buy for ${item.type} ${item._staticData.name} is ${minBuy}`, 'Core - Transfermarket');
    }
    return minBuy;
  }

  /**
   * List item on transfermarket
   *
   * @param {FUTItem} item
   * @param {number} start start price
   * @param {number} buyNow buy now price
   * @param {number} duration time to list in seconds (1, 3, 6, 12, 24 or 72 hours)
   */
  async listItem(item, start, buyNow, duration = 3600) {
    return new Promise(async (resolve, reject) => {
      if (gUserModel.getTradeAccess() !== models.UserModel.TRADE_ACCESS.WHITELIST) {
        reject(new Error('You are not authorized for trading'));
        return;
      }

      const prices = priceTiers.determineListPrice(start, buyNow);

      await this.sendToTradePile(item);
      await utils.sleep(1000);

      const listItem = new communication.ListItemDelegate({
        itemId: item.id,
        startingBid: prices.start,
        buyNowPrice: prices.buyNow,
        duration,
      });
      listItem.addListener(communication.BaseDelegate.SUCCESS, this, (sender) => {
        sender.clearListenersByScope(this);
        resolve({
          startingBid: prices.start,
          buyNowPrice: prices.buyNow,
        });
      });
      listItem.addListener(communication.BaseDelegate.FAIL, this, (sender, response) => {
        sender.clearListenersByScope(this);
        reject(new ListItemError(response));
      });
      listItem.send();
    });
  }

  sendToTradePile(item) {
    return new Promise((resolve, reject) => {
      const moveItem = new communication.MoveItemDelegate([item], enums.FUTItemPile.TRANSFER);
      moveItem.addListener(communication.BaseDelegate.SUCCESS, this, (sender) => {
        sender.clearListenersByScope(this);
        resolve();
      });
      moveItem.addListener(communication.BaseDelegate.FAIL, this, (sender, response) => {
        sender.clearListenersByScope(this);
        reject(new Error(response));
      });
      moveItem.send();
    });
  }

  relistAllItems() {
    return new Promise((resolve, reject) => {
      if (gUserModel.getTradeAccess() !== models.UserModel.TRADE_ACCESS.WHITELIST) {
        reject(new Error('You are not authorized for trading'));
        return;
      }

      const relistExpired = new communication.AuctionRelistDelegate();

      relistExpired.addListener(communication.BaseDelegate.SUCCESS, this, (sender) => {
        sender.clearListenersByScope(this);
        repositories.Item.setDirty(enums.FUTItemPile.TRANSFER);
        resolve();
      });

      relistExpired.addListener(communication.BaseDelegate.FAIL, this, (sender, error) => {
        sender.clearListenersByScope(this);
        reject(new Error(error));
      });
      relistExpired.execute();
    });
  }

  async _findLowUp(item, itemsForMean) {
    const searchCriteria = this._defineSearchCriteria(item, 200);
    await PinEvent.sendPageView('Transfer Market Search');
    await utils.sleep(3000);
    await PinEvent.sendPageView('Transfer Market Results - List View', 0);
    await PinEvent.sendPageView('Item - Detail View', 0);
    const items = await this._find(searchCriteria);
    if (items.length > itemsForMean) {
      // we find more than X listed at this price, so it must be low value
      return 200;
    }

    return 0; // trigger searching low down
  }

  async _findLowDown(item, itemsForMean) {
    let minBuy = 99999999;
    const searchCriteria = this._defineSearchCriteria(item);

    let valuesFound = [];
    for (let minBuyFound = false; minBuyFound === false;) {
      /* eslint-disable no-await-in-loop */
      await PinEvent.sendPageView('Transfer Market Search');
      await utils.sleep(800);
      await PinEvent.sendPageView('Transfer Market Results - List View', 0);
      await PinEvent.sendPageView('Item - Detail View', 0);
      const items = await this._find(searchCriteria);
      /* eslint-enable no-await-in-loop */
      if (items.length > 0) {
        valuesFound = valuesFound.concat(items.map(i => i._auction.buyNowPrice));

        const minBuyOnPage = Math.min(...items.map(i => i._auction.buyNowPrice));
        if (minBuyOnPage < minBuy) {
          minBuy = minBuyOnPage;
          if (items.length < searchCriteria.count) {
            minBuyFound = true;
            break;
          }
          searchCriteria.maxBuy = priceTiers.roundDownToNearestPriceTiers(minBuy);
          if (searchCriteria.maxBuy < 200) {
            searchCriteria.maxBuy = 200;
          }
        } else if (items.length === searchCriteria.count) {
          if (searchCriteria.maxBuy === 0) {
            searchCriteria.maxBuy = minBuy;
          } else {
            searchCriteria.maxBuy = priceTiers.roundDownToNearestPriceTiers(searchCriteria.maxBuy);
          }
          if (searchCriteria.maxBuy < 200) {
            searchCriteria.maxBuy = 200;
            minBuy = 200;
            minBuyFound = true;
          }
        } else {
          minBuy = Math.min(...items.map(i => i._auction.buyNowPrice));
          minBuyFound = true;
        }
      } else {
        minBuyFound = true;
      }
    }

    valuesFound = valuesFound.sort((a, b) => a - b).slice(0, itemsForMean);

    if (valuesFound.length > 0) {
      return priceTiers.roundValueToNearestPriceTiers(mean(valuesFound));
    }

    return 0; // player extinct
  }

  /* eslint-disable class-methods-use-this */
  _defineSearchCriteria(item, maxBuy = -1) {
    // TODO: check if this can handle other items as well
    // eslint-disable-next-line no-undef
    const searchCriteria = new UTSearchCriteriaDTO();
    searchCriteria.count = 30;
    searchCriteria.maskedDefId = item.definitionId;
    searchCriteria.type = item.type;

    if (item.rareflag === 47) { // 47 = Champions
      // if it is a Champions card, this is seen as a gold card
      // Can only search for "Gold" in this case
      searchCriteria.level = factories.DataProvider.getItemLevelDP(true)
        .filter(d => d.id === 2)[0].value;
    } else if (item.rareflag >= 3) { // 3 = TOTW
      // if it is TOTW or other special, set it to TOTW. See enums.ItemRareType.
      // Can only search for "Specials", not more specific on Rare Type
      searchCriteria.level = factories.DataProvider.getItemLevelDP(true)
        .filter(d => d.id === 3)[0].value;
    }

    searchCriteria.category = SearchCategory.ANY;
    searchCriteria.position = SearchType.ANY;
    if (maxBuy !== -1) {
      searchCriteria.maxBuy = maxBuy;
    }

    return searchCriteria;
  }
  /* eslint-enable class-methods-use-this */

  _find(searchCriteria) {
    return new Promise((resolve, reject) => {
      services.Item.searchTransferMarket(searchCriteria, 1).observe(
        this,
        function (obs, res) {
          if (!res.success) {
            obs.unobserve(this);
            reject(res.status);
          } else {
            resolve(res.data.items);
          }
        },
      );
    });
  }
}
