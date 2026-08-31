import '../sass/index.sass';
import { load_toast } from './libs';
import { Ui } from './ui';

console.log('App initialized on page:', window.location.pathname);
Ui.init()

loadReactModule('module1');
load_toast()

function loadReactModule(moduleName) {
  if (process.env.NODE_ENV === 'development') {
    // В dev-режиме ищем тег скрипта или загружаем динамически
    // Rsbuild автоматически привязывает манифест скриптов в dev
    const scripts = Array.from(document.querySelectorAll('script'));
    const isAlreadyLoaded = scripts.some(s => s.src.includes(moduleName));

    if (!isAlreadyLoaded) {
      // Подтягиваем JS и CSS в dev-режиме по базовому пути
      import(`./react/${moduleName}/App.jsx`)
        .catch(err => console.error(`Ошибка загрузки модуля ${moduleName}:`, err));
    }
  }
}