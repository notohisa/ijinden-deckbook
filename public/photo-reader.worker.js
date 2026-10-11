/* global importScripts */
// Same-origin, disposable Worker. The only requests are GETs for the bundled
// reference index and OpenCV; photo pixels are never transmitted over a network.
const progress = (message) => self.postMessage({ type: 'progress', message });

function decodeBytes(text) {
  const binary = atob(text);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function normalize(values) {
  const result = new Float32Array(values.length);
  const count = values.length / 3;
  for (let channel = 0; channel < 3; channel += 1) {
    let sum = 0;
    let squares = 0;
    for (let i = channel; i < values.length; i += 3) {
      sum += values[i];
      squares += values[i] ** 2;
    }
    const mean = sum / count;
    const deviation = Math.max(18, Math.sqrt(squares / count - mean ** 2));
    for (let i = channel; i < values.length; i += 3)
      result[i] = (values[i] - mean) / deviation;
  }
  return result;
}

function similarity(left, right) {
  let distance = 0;
  for (let i = 0; i < left.length; i += 1)
    distance += (left[i] - right[i]) ** 2;
  return Math.max(0, 1 - distance / left.length / 2);
}

function orderedQuad(points) {
  const cx = points.reduce((sum, point) => sum + point[0], 0) / 4;
  const cy = points.reduce((sum, point) => sum + point[1], 0) / 4;
  const sorted = [...points].sort(
    (a, b) =>
      Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx),
  );
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  // Card short edge becomes the top. Both resulting 180-degree orientations
  // are compared later, so rotated photos do not require an orientation guess.
  if (distance(sorted[0], sorted[1]) > distance(sorted[1], sorted[2]))
    sorted.push(sorted.shift());
  return sorted;
}

function overlap(a, b) {
  const width = Math.max(
    0,
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  );
  const height = Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  );
  return (width * height) / Math.min(a.width * a.height, b.width * b.height);
}

function detectCards(cv, source) {
  const gray = new cv.Mat();
  const blur = new cv.Mat();
  const red = new cv.Mat();
  const redBlur = new cv.Mat();
  const edges = new cv.Mat();
  const closed = new cv.Mat();
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
  const candidates = [];
  cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
  const channels = new cv.MatVector();
  cv.split(source, channels);
  const redChannel = channels.get(0);
  redChannel.copyTo(red);
  redChannel.delete();
  channels.delete();
  cv.GaussianBlur(red, redBlur, new cv.Size(5, 5), 0);
  const imageArea = source.cols * source.rows;
  try {
    for (const mode of ['adaptive', 'red-canny']) {
      if (mode === 'red-canny') cv.Canny(redBlur, edges, 60, 180, 3, true);
      else
        cv.adaptiveThreshold(
          blur,
          edges,
          255,
          cv.ADAPTIVE_THRESH_GAUSSIAN_C,
          cv.THRESH_BINARY_INV,
          31,
          6,
        );
      cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, kernel);
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(
        closed,
        contours,
        hierarchy,
        cv.RETR_LIST,
        cv.CHAIN_APPROX_SIMPLE,
      );
      try {
        for (let i = 0; i < contours.size(); i += 1) {
          const contour = contours.get(i);
          const poly = new cv.Mat();
          try {
            const area = cv.contourArea(contour);
            if (area < imageArea * 0.003 || area > imageArea * 0.7) continue;
            for (const epsilon of [0.012, 0.018, 0.024, 0.032, 0.04]) {
              cv.approxPolyDP(
                contour,
                poly,
                cv.arcLength(contour, true) * epsilon,
                true,
              );
              if (poly.rows === 4 && cv.isContourConvex(poly)) break;
            }
            if (poly.rows !== 4 || !cv.isContourConvex(poly)) continue;
            const points = Array.from({ length: 4 }, (_, n) => [
              poly.data32S[n * 2],
              poly.data32S[n * 2 + 1],
            ]);
            const quad = orderedQuad(points);
            const side = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
            const width = (side(quad[0], quad[1]) + side(quad[2], quad[3])) / 2;
            const height =
              (side(quad[1], quad[2]) + side(quad[3], quad[0])) / 2;
            if (width / height < 0.55 || width / height > 0.88 || width < 35)
              continue;
            const box = cv.boundingRect(poly);
            candidates.push({
              quad,
              box,
              area,
              clipped: points.some(
                ([x, y]) =>
                  x <= 2 ||
                  y <= 2 ||
                  x >= source.cols - 3 ||
                  y >= source.rows - 3,
              ),
            });
          } finally {
            poly.delete();
            contour.delete();
          }
        }
      } finally {
        contours.delete();
        hierarchy.delete();
      }
    }
    // With many cards, reject multi-card outlines by their isolated size. This
    // is relative to detected sizes, not the expected count of a particular deck.
    const sizes = candidates
      .map((candidate) => candidate.area)
      .sort((a, b) => a - b);
    const median = sizes[Math.floor(sizes.length / 2)] ?? 1;
    const plausible =
      candidates.length >= 12
        ? candidates.filter(
            (candidate) =>
              candidate.area >= median * 0.4 && candidate.area <= median * 2.5,
          )
        : candidates;
    const kept = [];
    plausible.sort(
      (a, b) =>
        Math.abs(Math.log(a.area / median)) -
        Math.abs(Math.log(b.area / median)),
    );
    for (const candidate of plausible) {
      if (!kept.some((other) => overlap(candidate.box, other.box) > 0.6))
        kept.push(candidate);
    }
    return kept.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  } finally {
    gray.delete();
    blur.delete();
    red.delete();
    redBlur.delete();
    edges.delete();
    closed.delete();
    kernel.delete();
  }
}

function cropCard(cv, source, quad) {
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, quad.flat());
  const to = cv.matFromArray(
    4,
    1,
    cv.CV_32FC2,
    [0, 0, 223, 0, 223, 319, 0, 319],
  );
  const transform = cv.getPerspectiveTransform(from, to);
  const result = new cv.Mat();
  try {
    cv.warpPerspective(
      source,
      result,
      transform,
      new cv.Size(224, 320),
      cv.INTER_LINEAR,
      cv.BORDER_REPLICATE,
    );
  } finally {
    from.delete();
    to.delete();
    transform.delete();
  }
  return result;
}

function describe(cv, card, orb) {
  const art = card.roi(new cv.Rect(12, 48, 200, 134));
  const small = new cv.Mat();
  const rgb = new cv.Mat();
  const gray = new cv.Mat();
  const mask = new cv.Mat();
  const points = new cv.KeyPointVector();
  const descriptors = new cv.Mat();
  try {
    cv.cvtColor(art, rgb, cv.COLOR_RGBA2RGB);
    cv.resize(rgb, small, new cv.Size(20, 16), 0, 0, cv.INTER_AREA);
    cv.cvtColor(art, gray, cv.COLOR_RGBA2GRAY);
    orb.detectAndCompute(gray, mask, points, descriptors);
    return { thumb: normalize(small.data), points, descriptors };
  } catch (error) {
    points.delete();
    descriptors.delete();
    throw error;
  } finally {
    art.delete();
    small.delete();
    rgb.delete();
    gray.delete();
    mask.delete();
  }
}

function geometricMatches(cv, query, reference, matcher) {
  const bytes = reference.descriptors;
  if (bytes.length < 64 || query.descriptors.rows < 2) return 0;
  const train = cv.matFromArray(bytes.length / 32, 32, cv.CV_8U, bytes);
  const matches = new cv.DMatchVectorVector();
  try {
    matcher.knnMatch(query.descriptors, train, matches, 2);
    const distinct = new Set();
    for (let i = 0; i < matches.size(); i += 1) {
      const pair = matches.get(i);
      try {
        if (pair.size() < 2) continue;
        const best = pair.get(0);
        const next = pair.get(1);
        if (best.distance > 64 || best.distance >= next.distance * 0.82)
          continue;
        const position = query.points.get(best.queryIdx).pt;
        const expected = reference.points[best.trainIdx];
        if (Math.hypot(position.x - expected[0], position.y - expected[1]) < 26)
          distinct.add(best.trainIdx);
      } finally {
        pair.delete();
      }
    }
    return distinct.size;
  } finally {
    train.delete();
    matches.delete();
  }
}

function identify(cv, card, references, orb, matcher) {
  const upsideDown = new cv.Mat();
  cv.rotate(card, upsideDown, cv.ROTATE_180);
  const orientations = [describe(cv, card, orb), describe(cv, upsideDown, orb)];
  try {
    let ranked = references
      .map((reference) => {
        const scores = orientations.map((query) =>
          similarity(query.thumb, reference.normalized),
        );
        const orientation = scores[1] > scores[0] ? 1 : 0;
        return { reference, scores, visual: scores[orientation], orientation };
      })
      .sort((a, b) => b.visual - a.visual);
    const evaluate = (candidate) => {
      const versions = orientations.map((query, orientation) => {
        const inliers = geometricMatches(
          cv,
          query,
          candidate.reference,
          matcher,
        );
        return {
          ...candidate,
          orientation,
          inliers,
          visual: candidate.scores[orientation],
          score:
            candidate.scores[orientation] * 0.65 +
            Math.min(1, inliers / 14) * 0.35,
        };
      });
      return versions[1].score > versions[0].score ? versions[1] : versions[0];
    };
    const initial = ranked
      .slice(0, 18)
      .map(evaluate)
      .sort((a, b) => b.score - a.score);
    // Glare can defeat the cheap color shortlist. Broaden it only for weak
    // candidates, retaining independent geometric evidence for both rotations.
    if (initial[0].inliers < 7 || initial[0].score < 0.7) {
      ranked = [...initial, ...ranked.slice(18, 120).map(evaluate)];
    } else {
      ranked = initial;
    }
    ranked.sort((a, b) => b.score - a.score);
    const best = ranked[0];
    const margin = best.score - (ranked[1]?.score ?? 0);
    const selectedCardId =
      best.visual >= 0.48 || best.inliers >= 7 ? best.reference.id : null;
    const confidence =
      selectedCardId &&
      ((best.inliers >= 6 && best.visual >= 0.62 && margin >= 0.045) ||
        (best.visual >= 0.88 && margin >= 0.07))
        ? 'high'
        : 'review';
    return {
      selectedCardId,
      confidence,
      candidates: ranked
        .slice(0, 4)
        .map((candidate) => ({
          cardId: candidate.reference.id,
          score: Math.round(candidate.score * 1000) / 1000,
        })),
      pixels: (best.orientation === 1 ? upsideDown : card).data.slice().buffer,
    };
  } finally {
    for (const item of orientations) {
      item.points.delete();
      item.descriptors.delete();
    }
    upsideDown.delete();
  }
}

self.onmessage = async ({ data }) => {
  try {
    progress(
      '読み取り機能とカード情報を準備しています（初回は通信が必要です）…',
    );
    const indexRequest = fetch('./photo-card-index.json').then((response) => {
      if (!response.ok)
        throw new Error(
          'カード情報を読み込めませんでした。通信状態を確認してください。',
        );
      return response.json();
    });
    importScripts('./vendor/opencv-5.0.0.js');
    const cv = await self.cv;
    const index = await indexRequest;
    if (
      index.version !== 1 ||
      !Array.isArray(index.entries) ||
      !cv.Mat ||
      !cv.ORB
    )
      throw new Error(
        '読み取り機能のバージョンが一致しません。再読み込みしてください。',
      );
    const references = index.entries.map((entry) => ({
      ...entry,
      normalized: normalize(decodeBytes(entry.thumb)),
      descriptors: decodeBytes(entry.orb),
    }));
    const source = cv.matFromArray(
      data.height,
      data.width,
      cv.CV_8UC4,
      new Uint8Array(data.pixels),
    );
    const orb = new cv.ORB(160, 1.2, 8, 8, 0, 2, cv.ORB_HARRIS_SCORE, 21, 7);
    const matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
    try {
      progress('写真からカードの位置を探しています…');
      const detected = detectCards(cv, source);
      const boxes = detected.slice(0, 64);
      const matches = [];
      for (let i = 0; i < boxes.length; i += 1) {
        progress(`${i + 1}/${boxes.length}枚目のカードを照合しています…`);
        const card = cropCard(cv, source, boxes[i].quad);
        try {
          const match = identify(cv, card, references, orb, matcher);
          if (boxes[i].clipped) match.confidence = 'review';
          matches.push(match);
        } finally {
          card.delete();
        }
      }
      const warnings = [];
      if (detected.length > 64)
        warnings.push(
          '検出数が多いため、先頭64枚を表示しています。写真を分けて取り込んでください。',
        );
      if (!matches.length)
        warnings.push(
          'カードを検出できませんでした。背景とカードの境目がはっきりした写真で試すか、カードを手動で追加してください。',
        );
      if (boxes.some((box) => box.clipped))
        warnings.push(
          '写真の端で切れた候補があります。カード名と枚数を確認してください。',
        );
      self.postMessage(
        {
          type: 'result',
          matches,
          referenceCount: references.length,
          warnings,
        },
        matches.map((match) => match.pixels),
      );
    } finally {
      source.delete();
      orb.delete();
      matcher.delete();
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      message:
        error instanceof Error && error.message
          ? error.message
          : '写真を読み取れませんでした。明るく、カードを重ねずに撮った写真で試してください。',
    });
  }
};
