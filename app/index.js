/* globals onVisibilityChanged services UTGameFlowNavigationController
UTViewController EAObservable window document $ */
import 'babel-polyfill';
import './index.scss';
import initSettingsScreen from './settings';

import { Settings, Queue } from './core';

import { Logger } from '../fut';
/*
  RemoveSoldAuctionsSettings,
  RelistAuctionsSettings,
*/
import {
  RefreshListSettings,
  CardInfoSettings,
  ListSizeSettings,
  MinBinSettings,
  TransferTotalsSettings,
} from './transferlist';

import {
  FutbinSettings,
} from './futbin';

import {
  InstantBinConfirmSettings,
} from './instant-bin-confirm';
/*
import {
  ClubInfoSettings,
} from './club';
*/

window.onPageNavigation = new EAObservable();

window.currentPage = '';

UTGameFlowNavigationController.prototype.didPush = (t) => {
  if (t) {
    window.onPageNavigation.notify(t.className);
    window.currentPage = t.className;
  }
};

UTViewController.prototype.didPresent = (t) => {
  if (t) {
    window.onPageNavigation.notify(t.className);
    window.currentPage = t.className;
  }
};

setTimeout(() => {
  services.Authentication.oAuthentication.observe(
    this,
    () => {
      // reset the logs at startup
      new Logger().reset();

      // force full web app layout in any case
      $('body').removeClass('phone').addClass('landscape');

      Queue.getInstance().start();

      // get rid of pinEvents when switching tabs
      document.removeEventListener('visibilitychange', onVisibilityChanged);

      const settings = Settings.getInstance();
      settings.registerEntry(new RefreshListSettings());
      settings.registerEntry(new MinBinSettings());
      settings.registerEntry(new CardInfoSettings());
      settings.registerEntry(new ListSizeSettings());
      settings.registerEntry(new TransferTotalsSettings());

      settings.registerEntry(new FutbinSettings());
      settings.registerEntry(new InstantBinConfirmSettings());

      initSettingsScreen(settings);
    },
  );
}, 1000);
