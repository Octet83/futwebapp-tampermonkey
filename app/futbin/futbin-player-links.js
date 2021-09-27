/* globals
window $ document
*/
import { BaseScript, Database } from '../core';
import { FutbinSettings } from './settings-entry';

export class FutbinPlayerLinks extends BaseScript {
  constructor() {
    super(FutbinSettings.id);

    const MutationObserver = window.MutationObserver || window.WebKitMutationObserver;
    this._observer = new MutationObserver(this._mutationHandler.bind(this));

    this._playerPrices = [];
  }

  activate(state) {
    super.activate(state);

    const obsConfig = {
      childList: true,
      characterData: true,
      attributes: false,
      subtree: true,
    };

    setTimeout(() => {
      this._observer.observe($(document)[0], obsConfig);
    }, 0);
  }

  deactivate(state) {
    super.deactivate(state);

    $('#futbinPlayerLink').remove();

    this._observer.disconnect();
  }

  _mutationHandler(mutationRecords) {
    mutationRecords.forEach(function (mutation) {
      if ($(mutation.target).hasClass('DetailView') && $(mutation.target)
        .find('.DetailPanel') && mutation.addedNodes.length > 0) {
        if (this.getSettings()['show-link-to-player'].toString() !== 'true') {
          return;
        }

        let selectedItem = this._getSelectedItem();
        if (selectedItem == null || selectedItem.id === 0) {
          return;
        }

        const futbinPlayerLink = $(mutation.target).find('#futbinPlayerLink');
        futbinPlayerLink.remove();
        console.log(selectedItem);
        $(mutation.target).find('.DetailPanel > .ut-button-group').prepend(`<button id="futbinPlayerLink" data-resource-id="${selectedItem.id}" class="list"><span class="btn-text">View on Futbin</span><span class="btn-subtext"></span></button>`);

        $('#futbinPlayerLink').bind('click', async () => {
          let btn = $('#futbinPlayerLink');
          btn.find('.btn-text').html('Searching on Futbin ...');
          const futbinLink = await FutbinPlayerLinks._getFutbinPlayerUrl(selectedItem);
          selectedItem = this._getSelectedItem();
          btn = $('#futbinPlayerLink');

          if (btn.data('resource-id') === selectedItem.id) {
            if (futbinLink) {
              btn.find('.btn-text').html('View on Futbin');
              window.open(futbinLink);
            } else {
              btn.find('.btn-text').html('No exact Futbin player found');
            }
          }
        });
      }
    }, this);
  }

  static _getFutbinPlayerUrl(item) {
    return new Promise((resolve) => {
      if (!item._staticData) {
        return resolve(null);
      }

      let futbinPlayerIds = Database.getJson('futbin-player-ids', []);
      const futbinPlayer = futbinPlayerIds.find(i => i.id === item.id);
      if (futbinPlayer != null) {
        return resolve(`https://www.futbin.com/22/player/${futbinPlayer.futbinId}`);
      }

      const name = `${item._staticData.firstName} ${item._staticData.lastName}`.replace(' ', '+');
      const url = `https://www.futbin.com/search?year=22&term=${name}`;
      console.log('Searching '+name+' on futbin');
      return GM_xmlhttpRequest({
        method: 'GET',
        url,
        onload: (res) => {
          console.log(res.status);
          console.log(res.response);
          if (res.status !== 200) {
            return resolve(null);
          }
          const players = JSON.parse(res.response);
          let exactPlayers = players.filter(p =>
            parseInt(p.rating, 10) === parseInt(item.rating, 10));
          if (exactPlayers.length > 1) {
            exactPlayers = exactPlayers.filter(p =>
              p.rare_type === item.rareflag.toString() &&
              p.club_image.endsWith(`/${item.teamId}.png`));
          }
          if (exactPlayers.length === 1) {
            futbinPlayerIds = Database.getJson('futbin-player-ids', []);
            if (futbinPlayerIds.find(i => i.id === item.resourceId) == null) {
              futbinPlayerIds.push({
                id: item.resourceId,
                futbinId: exactPlayers[0].id,
              });
            }
            Database.setJson('futbin-player-ids', futbinPlayerIds);
            return resolve(`https://www.futbin.com/22/player/${exactPlayers[0].id}`);
          } else if (exactPlayers.length > 1) {
            // Take first one, several players are returned more than once
            console.log('Multi players found');
            return resolve(`https://www.futbin.com/22/player/${exactPlayers[0].id}`);
          }

          return resolve(null); // TODO: what should we do if we find more than one?
        },
        onerror:(res) => {
          console.log('Error futbin');
          console.log(res);
          return resolve(null); 
        }
      });
    });
  }

  /* eslint-disable class-methods-use-this */
  _getSelectedItem() {
    const listController = getAppMain().getRootViewController()
      .getPresentedViewController().getCurrentViewController()
      .getCurrentController()._listController;
    if (listController) {
      return listController.getIterator().current();
    }

    const currentController = getAppMain().getRootViewController()
      .getPresentedViewController().getCurrentViewController()
      .getCurrentController()._rightController._currentController;
    if (currentController && currentController._viewmodel) {
      const current = currentController._viewmodel.current();

      return current._item ? current._item : current;
    }

    return null;
  }
  /* eslint-enable class-methods-use-this */
}

new FutbinPlayerLinks(); // eslint-disable-line no-new
