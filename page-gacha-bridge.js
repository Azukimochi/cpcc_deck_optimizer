(() => {
  if (window.__cpccGachaBridgeInstalled) return;
  window.__cpccGachaBridgeInstalled = true;

  function buildCompactGachaResult(pulledCards, gachaType) {
    const cards = Array.isArray(pulledCards) ? pulledCards : [];
    const rarityCounts = cards.reduce((map, card) => {
      const rarity = String(card?.レアリティ || card?.rarity || '?');
      map.set(rarity, (map.get(rarity) || 0) + 1);
      return map;
    }, new Map());

    const rarityOrder = ['SSR', 'SR', 'R', 'N'];
    const summary = rarityOrder
      .filter(rarity => rarityCounts.has(rarity))
      .map(rarity => `${rarity}: ${rarityCounts.get(rarity)}枚`)
      .join(' / ');

    const typeLabelMap = {
      normal: '通常ガチャ',
      rare: 'レアガチャ',
      super_rare: 'スーパーレアガチャ',
      ssr: 'SSR確定ガチャ',
    };
    const label = typeLabelMap[gachaType] || 'ガチャ';
    const detail = summary || `${cards.length}枚獲得`;

    return `
      <div style="padding:12px;border-radius:12px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412;">
        <div style="font-weight:700;margin-bottom:6px;">${label} を ${cards.length} 回引きました</div>
        <div style="font-size:12px;line-height:1.5;">大量ガチャのため結果カード表示を省略しました。${detail}</div>
      </div>
    `;
  }

  function installCompactFinishOnce(gachaType, amount) {
    if (!(amount > 100) || typeof finishGachaAnimation !== 'function') {
      return () => {};
    }

    const original = finishGachaAnimation;
    const buttons = [
      dom?.btnPullNormal1, dom?.btnPullNormal10, dom?.btnPullNormal100,
      dom?.btnPullRare1, dom?.btnPullRare10, dom?.btnPullRare100,
      dom?.btnPullSr1, dom?.btnPullSr10, dom?.btnPullSr100,
      dom?.btnPullSsr1, dom?.btnPullSsr10, dom?.btnPullSsr100,
    ].filter(Boolean);

    const compactFinish = (pulledCards) => {
      state.isAnimating = false;
      state.animationInterrupt = null;

      if (dom?.gachaAnimationOverlay) {
        dom.gachaAnimationOverlay.classList.add('hidden-view');
      }
      if (dom?.animationCardsContainer) {
        dom.animationCardsContainer.innerHTML = '';
      }

      if (state.isTutorialActive && dom?.tutorialOverlay) {
        dom.tutorialOverlay.classList.remove('hidden');
        if (typeof updateTutorialOverlay === 'function') {
          updateTutorialOverlay();
        }
      }

      if (dom?.gachaResults) {
        dom.gachaResults.innerHTML = buildCompactGachaResult(pulledCards, gachaType);
      }

      if (typeof renderFieldView === 'function') {
        renderFieldView();
      }

      buttons.forEach(btn => {
        btn.disabled = false;
      });

      finishGachaAnimation = original;
      window.finishGachaAnimation = original;
    };

    finishGachaAnimation = compactFinish;
    window.finishGachaAnimation = compactFinish;

    return () => {
      finishGachaAnimation = original;
      window.finishGachaAnimation = original;
    };
  }

  document.addEventListener('cpcc:gacha-bridge-request', async (event) => {
    const detail = event.detail || {};
    const requestId = detail.requestId;
    const action = detail.action;

    const reply = (payload) => {
      document.dispatchEvent(new CustomEvent('cpcc:gacha-bridge-response', {
        detail: { requestId, ...payload },
      }));
    };

    try {
      if (action === 'status') {
        reply({
          ok: true,
          result: {
            cpcp: Number((typeof state !== 'undefined' ? state.CPCP : 0) || 0),
            pendingClicks: Number((typeof state !== 'undefined' ? state.pendingClicks : 0) || 0),
            inventoryCount: Array.isArray(typeof state !== 'undefined' ? state.inventory : null) ? state.inventory.length : 0,
            maxInventory: typeof MAX_INVENTORY_SIZE === 'number' ? MAX_INVENTORY_SIZE : 1000,
            isAnimating: !!(typeof state !== 'undefined' && state.isAnimating),
          },
        });
        return;
      }

      if (action === 'pull') {
        if (typeof pullGacha !== 'function') {
          throw new Error('pullGacha is not available');
        }

        const restoreFinish = installCompactFinishOnce(detail.gachaType, Number(detail.amount || 0));

        if (detail.amount > 100 && typeof skipGachaAnimation === 'function') {
          const timer = setInterval(() => {
            if (typeof state !== 'undefined' && state.isAnimating) {
              clearInterval(timer);
              setTimeout(() => {
                try {
                  skipGachaAnimation();
                } catch {}
              }, 0);
            }
          }, 50);
          setTimeout(() => clearInterval(timer), 5000);
        }

        try {
          await pullGacha(detail.gachaType, detail.amount);
          reply({ ok: true, result: { done: true } });
        } finally {
          restoreFinish();
        }
        return;
      }

      throw new Error('Unsupported action');
    } catch (error) {
      reply({
        ok: false,
        error: error instanceof Error ? error.message : String(error || 'Unknown error'),
      });
    }
  });
})();
