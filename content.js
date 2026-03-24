(() => {
  'use strict';

  const CLUBS = [
    'びしょく・りょうり部',
    'ぱーてぃくるらい部',
    'えいぞうけんきゅう部',
    'まんが・いらすと部',
    'ダンス部',
    'せいとかい',
    'しゃしん部',
    'えんそく部',
    'いんしゅ部',
    'おんがく部',
    'かいはつ部',
    'けいおん部',
    'ゲーム部',
    'こーほー部',
    'さぎょう部',
    'ぞうけい部',
    'デザイン部',
    'ほうそう部',
    'もでりんぐ部',
    '帰宅部',
  ].sort((a, b) => b.length - a.length);

  const WORK_RULES = {
    'たまり場': { type: 'none' }, // ユーザー要望により場効果は無視
    '生徒会室': { type: 'none' }, // ユーザー要望により場効果は無視
    'ダンスステージ': { type: 'clubMultiplier', clubs: ['ダンス部'], multiplier: 2 },
    'カフェバー': { type: 'clubMultiplier', clubs: ['いんしゅ部', 'びしょく・りょうり部'], multiplier: 2 },
    'ポータル': { type: 'clubMultiplier', clubs: ['えんそく部'], multiplier: 3 },
    '作業部屋': { type: 'onlyClub', clubs: ['さぎょう部'] },
  };

  const state = {
    cards: [],
    lastResults: {},
  };

  function init() {
    if (document.getElementById('cpcc-optimizer-root')) return;
    createPanel();
    reloadCards();
  }

  function createPanel() {
    const root = document.createElement('div');
    root.id = 'cpcc-optimizer-root';
    root.innerHTML = `
      <div class="cpcc-head">CPCC Deck Optimizer</div>
      <div class="cpcc-actions">
        <button id="cpcc-reload">カード再読込</button>
        <button id="cpcc-run-all">全ワーク計算</button>
        <button id="cpcc-close">閉じる</button>
      </div>
      <div id="cpcc-status">初期化中...</div>
      <div class="cpcc-work-buttons">
        <button data-work="たまり場">たまり場</button>
        <button data-work="生徒会室">生徒会室</button>
        <button data-work="ダンスステージ">ダンスステージ</button>
        <button data-work="カフェバー">カフェバー</button>
        <button data-work="ポータル">ポータル</button>
        <button data-work="作業部屋">作業部屋</button>
      </div>
      <div id="cpcc-result"></div>
    `;
    document.body.appendChild(root);

    if (!document.getElementById('cpcc-optimizer-style')) {
      const style = document.createElement('style');
      style.id = 'cpcc-optimizer-style';
      style.textContent = `
        #cpcc-optimizer-root{
          position:fixed;right:16px;bottom:16px;z-index:999999;
          width:360px;background:rgba(16,24,39,.95);color:#fff;
          border-radius:12px;padding:12px;box-shadow:0 12px 40px rgba(0,0,0,.35);
          font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
          font-size:12px;line-height:1.45;
        }
        #cpcc-optimizer-root button{
          border:none;border-radius:8px;padding:7px 10px;margin:2px;
          cursor:pointer;background:#2563eb;color:#fff;font-size:12px;
        }
        #cpcc-optimizer-root button:hover{filter:brightness(1.08)}
        .cpcc-head{font-weight:700;font-size:14px;margin-bottom:8px}
        .cpcc-actions,.cpcc-work-buttons{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
        #cpcc-status{margin-bottom:8px;padding:8px;border-radius:8px;background:rgba(255,255,255,.08)}
        #cpcc-result{max-height:420px;overflow:auto;padding-right:4px}
        .cpcc-card{padding:6px 8px;margin:4px 0;border-radius:8px;background:rgba(255,255,255,.08)}
        .cpcc-muted{opacity:.85}
        .cpcc-score{font-weight:700;color:#93c5fd}
      `;
      document.head.appendChild(style);
    }

    root.querySelector('#cpcc-reload').addEventListener('click', reloadCards);
    root.querySelector('#cpcc-run-all').addEventListener('click', runAllWorks);
    root.querySelector('#cpcc-close').addEventListener('click', () => root.remove());
    root.querySelectorAll('[data-work]').forEach(btn => {
      btn.addEventListener('click', () => runOneWork(btn.dataset.work));
    });
  }

  function setStatus(text) {
    const el = document.getElementById('cpcc-status');
    if (el) el.textContent = text;
  }

  function setResultHtml(html) {
    const el = document.getElementById('cpcc-result');
    if (el) el.innerHTML = html;
  }

  function reloadCards() {
    const cards = parseOwnedCardsRobust();
    state.cards = cards;
    setStatus(`カード ${cards.length} 枚を読み込みました`);
    setResultHtml(cards.length ? renderLoadedPreview(cards) : `<div class="cpcc-card">カードを検出できませんでした。DOM構造が変わっている可能性があります。</div>`);
    console.log('[CPCC] parsed cards:', cards);
  }

  function renderLoadedPreview(cards) {
    const preview = cards.slice(0, 8).map(c => {
      const eff = c.effects.length
        ? c.effects.map(e => `${e.club} ${e.value > 0 ? '+' : ''}${e.value}%`).join(', ')
        : '効果なし';
      return `<div class="cpcc-card">
        <div><strong>${escapeHtml(c.name)}</strong> <span class="cpcc-muted">[${escapeHtml(c.rarity)}]</span></div>
        <div>Power: ${c.power} / 部活: ${escapeHtml(c.club)}</div>
        <div class="cpcc-muted">${escapeHtml(eff)}</div>
      </div>`;
    }).join('');

    return `
      <div class="cpcc-card">先頭 ${Math.min(cards.length, 8)} 枚を表示中</div>
      ${preview}
    `;
  }

  function runAllWorks() {
    if (!state.cards.length) reloadCards();
    if (!state.cards.length) return;

    const works = Object.keys(WORK_RULES);
    const rows = [];

    for (const work of works) {
      const res = findBestDeck(state.cards, work);
      state.lastResults[work] = res;
      rows.push(renderWorkResult(work, res));
    }

    setResultHtml(rows.join(''));
  }

  function runOneWork(workName) {
    if (!state.cards.length) reloadCards();
    if (!state.cards.length) return;

    const res = findBestDeck(state.cards, workName);
    state.lastResults[workName] = res;
    setResultHtml(renderWorkResult(workName, res));
  }

  function renderWorkResult(workName, res) {
    if (!res || !res.deck || !res.deck.length) {
      return `<div class="cpcc-card"><strong>${escapeHtml(workName)}</strong><br>候補が見つかりませんでした。</div>`;
    }

    const items = res.deck.map(c => {
      const bonus = res.detail.byCard[c.id] ?? 0;
      return `
        <div class="cpcc-card">
          <div><strong>${escapeHtml(c.name)}</strong> <span class="cpcc-muted">[${escapeHtml(c.rarity)}]</span></div>
          <div>部活: ${escapeHtml(c.club)} / 基礎Power: ${c.power}</div>
          <div>部活補正合計: ${bonus > 0 ? '+' : ''}${bonus}%</div>
        </div>
      `;
    }).join('');

    return `
      <div class="cpcc-card">
        <div><strong>${escapeHtml(workName)}</strong></div>
        <div class="cpcc-score">推定合計Power: ${Math.round(res.score).toLocaleString()}</div>
        <div class="cpcc-muted">候補数: ${res.candidateCount} / 探索組数: ${res.checked.toLocaleString()}</div>
      </div>
      ${items}
    `;
  }

  // ----------------------------
  // ここが修正版: 所有カードをかなり強引に拾う
  // ----------------------------

  function parseOwnedCardsRobust() {
    const roots = findOwnedCardRoots();
    const cards = [];

    roots.forEach((root, index) => {
      const card = parseCardFromRoot(root, index);
      if (card) cards.push(card);
    });

    return dedupeCards(cards);
  }

  function findOwnedCardRoots() {
    // 所有カードの各カードには ✖ ボタンがあるので、それを起点に探す
    const deleteButtons = [...document.querySelectorAll('button')]
      .filter(btn => normalizeSpace(btn.textContent).includes('✖'));

    const roots = [];
    const seen = new Set();

    for (const btn of deleteButtons) {
      const root = findCardRootFromDeleteButton(btn);
      if (!root) continue;
      if (seen.has(root)) continue;
      seen.add(root);
      roots.push(root);
    }

    return roots;
  }

  function findCardRootFromDeleteButton(btn) {
    let current = btn.parentElement;
    while (current && current !== document.body) {
      const text = normalizeSpace(current.innerText || current.textContent || '');
      const hasPower = /Power\s*\d+/i.test(text);
      const hasDelete = [...current.querySelectorAll('button')]
        .some(b => normalizeSpace(b.textContent).includes('✖'));
      const hasMainImage = !!findMainCardImage(current);

      // 小さすぎる要素ではなく、カード全体っぽい祖先を選ぶ
      if (hasPower && hasDelete && hasMainImage) {
        return current;
      }

      current = current.parentElement;
    }
    return null;
  }

  function findMainCardImage(root) {
    const imgs = [...root.querySelectorAll('img[alt]')];
    return imgs.find(img => {
      const alt = (img.getAttribute('alt') || '').trim();
      const src = (img.getAttribute('src') || '').trim();
      if (!alt) return false;
      if (src.includes('icon_')) return false;
      if (['R', 'SR', 'SSR', 'N'].includes(alt)) return false;
      if (alt === 'からぱり☆カードコレクション!') return false;
      return true;
    }) || null;
  }

  function parseCardFromRoot(root, index) {
    const text = normalizeSpace(root.innerText || root.textContent || '');
    const img = findMainCardImage(root);
    if (!img) return null;

    const name = (img.getAttribute('alt') || '').trim();
    const powerMatch = text.match(/Power\s*(\d+)/i);
    if (!name || !powerMatch) return null;

    const power = Number(powerMatch[1]);
    const rarity = parseRarity(root) || 'N';
    const club = parseClub(text);
    const effects = parseEffects(text);

    if (!club) {
      console.warn('[CPCC] club not found:', { name, text, root });
      return null;
    }

    return {
      id: `${name}__${power}__${club}__${rarity}__${index}`,
      name,
      power,
      club,
      rarity,
      effects,
      root,
    };
  }

  function parseRarity(root) {
    const imgs = [...root.querySelectorAll('img[alt]')];
    for (const img of imgs) {
      const alt = (img.getAttribute('alt') || '').trim();
      const src = (img.getAttribute('src') || '').trim();
      if (src.includes('icon_') && ['N', 'R', 'SR', 'SSR'].includes(alt)) {
        return alt;
      }
    }

    const text = normalizeSpace(root.innerText || root.textContent || '');
    const m = text.match(/\b(SSR|SR|R|N)\b/);
    return m ? m[1] : null;
  }

  function parseClub(text) {
    return CLUBS.find(club => text.includes(club)) || null;
  }

  function parseEffects(text) {
    const effects = [];
    for (const club of CLUBS) {
      const escaped = escapeRegExp(club);
      const re = new RegExp(`${escaped}\\s*([+-]\\d+)%`, 'g');
      let m;
      while ((m = re.exec(text)) !== null) {
        effects.push({
          club,
          value: Number(m[1]),
        });
      }
    }
    return effects;
  }

  function dedupeCards(cards) {
    const map = new Map();
    for (const c of cards) {
      const key = `${c.name}__${c.power}__${c.club}__${c.rarity}__${c.effects.map(e => `${e.club}:${e.value}`).join(',')}`;
      // 同一カードが複数ある可能性はあるので、完全重複だけを除外
      if (!map.has(key)) {
        map.set(key, c);
      }
    }
    return [...map.values()];
  }

  // ----------------------------
  // 最適化ロジック
  // ----------------------------

  function findBestDeck(cards, workName) {
    const rule = WORK_RULES[workName];
    const candidates = buildCandidates(cards, rule, workName);

    let bestDeck = null;
    let bestScore = -Infinity;
    let bestDetail = null;
    let checked = 0;

    const sorted = [...candidates].sort((a, b) => estimateCardValue(b, rule) - estimateCardValue(a, rule));

    dfs([], 0);

    return {
      deck: bestDeck || [],
      score: bestScore,
      detail: bestDetail || { byCard: {} },
      checked,
      candidateCount: sorted.length,
    };

    function dfs(deck, start) {
      if (deck.length === 5) {
        checked++;
        const detail = evaluateDeck(deck, rule);
        if (detail.total > bestScore) {
          bestScore = detail.total;
          bestDeck = [...deck];
          bestDetail = detail;
        }
        return;
      }

      const remain = 5 - deck.length;
      if (start >= sorted.length) return;
      if (sorted.length - start < remain) return;

      const upperBound = estimateUpperBound(deck, sorted, start, remain, rule);
      if (upperBound <= bestScore) return;

      for (let i = start; i < sorted.length; i++) {
        deck.push(sorted[i]);
        dfs(deck, i + 1);
        deck.pop();
      }
    }
  }

  function buildCandidates(cards, rule, workName) {
    const set = new Set();

    const topPower = [...cards]
      .sort((a, b) => b.power - a.power)
      .slice(0, 25);

    topPower.forEach(c => set.add(c));

    if (rule.type === 'clubMultiplier' || rule.type === 'onlyClub') {
      const targetClubs = new Set(rule.clubs);

      const sameClub = cards
        .filter(c => targetClubs.has(c.club))
        .sort((a, b) => b.power - a.power)
        .slice(0, 30);

      const supporters = cards
        .filter(c => c.effects.some(e => targetClubs.has(e.club) && e.value > 0))
        .sort((a, b) => sumPositiveEffectsForTargets(b, targetClubs) - sumPositiveEffectsForTargets(a, targetClubs))
        .slice(0, 20);

      sameClub.forEach(c => set.add(c));
      supporters.forEach(c => set.add(c));
    } else {
      // たまり場 / 生徒会室 は場効果無視なので、全体高Power + 強い正バフ持ち
      const supporters = cards
        .filter(c => c.effects.some(e => e.value > 0))
        .sort((a, b) => sumPositiveEffects(b) - sumPositiveEffects(a))
        .slice(0, 25);

      supporters.forEach(c => set.add(c));
    }

    // 各部活の上位も少し残して、意外な組み合わせも拾う
    for (const club of CLUBS) {
      cards
        .filter(c => c.club === club)
        .sort((a, b) => b.power - a.power)
        .slice(0, 5)
        .forEach(c => set.add(c));
    }

    return [...set];
  }

  function evaluateDeck(deck, rule) {
    const buffByClub = new Map();
    for (const card of deck) {
      for (const eff of card.effects) {
        buffByClub.set(eff.club, (buffByClub.get(eff.club) || 0) + eff.value);
      }
    }

    const byCard = {};
    let total = 0;

    for (const card of deck) {
      const base = applyWorkBase(card, rule);
      const clubBonus = buffByClub.get(card.club) || 0;
      const finalPower = Math.max(0, base * (1 + clubBonus / 100));

      byCard[card.id] = clubBonus;
      total += finalPower;
    }

    return { total, byCard };
  }

  function applyWorkBase(card, rule) {
    if (!rule || rule.type === 'none') {
      return card.power;
    }

    if (rule.type === 'clubMultiplier') {
      return rule.clubs.includes(card.club)
        ? card.power * rule.multiplier
        : card.power;
    }

    if (rule.type === 'onlyClub') {
      return rule.clubs.includes(card.club)
        ? card.power
        : 0;
    }

    return card.power;
  }

  function estimateCardValue(card, rule) {
    let score = applyWorkBase(card, rule);

    for (const eff of card.effects) {
      if (rule.type === 'clubMultiplier' || rule.type === 'onlyClub') {
        if (rule.clubs.includes(eff.club) && eff.value > 0) {
          score += eff.value * 3;
        }
      } else {
        if (eff.value > 0) score += eff.value * 2;
      }
    }

    return score;
  }

  function estimateUpperBound(deck, sorted, start, remain, rule) {
    let sum = 0;

    // いまのdeckをざっくり加点
    for (const c of deck) {
      sum += estimateCardValue(c, rule);
    }

    // 残り候補の上位を加算
    for (let i = start; i < Math.min(sorted.length, start + remain); i++) {
      sum += estimateCardValue(sorted[i], rule);
    }

    return sum;
  }

  function sumPositiveEffects(card) {
    return card.effects.reduce((s, e) => s + Math.max(0, e.value), 0);
  }

  function sumPositiveEffectsForTargets(card, targetClubs) {
    return card.effects.reduce((s, e) => {
      if (!targetClubs.has(e.club)) return s;
      return s + Math.max(0, e.value);
    }, 0);
  }

  // ----------------------------
  // utility
  // ----------------------------

  function normalizeSpace(str) {
    return String(str || '').replace(/\s+/g, ' ').trim();
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  // 遅延初期化
  const boot = () => {
    try {
      init();
    } catch (e) {
      console.error('[CPCC] init error', e);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();