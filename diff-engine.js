(function () {
  "use strict";

  var DEFAULT_LIMITS = {
    maxLineLcsCells: 2000000,
    maxCharacterLcsCells: 40000,
    maxSimilarityLcsCells: 12000,
    maxChangeBlockPairs: 25000,
  };

  function addWarning(state, message) {
    if (state && state.warnings.indexOf(message) === -1) {
      state.warnings.push(message);
    }
  }

  function splitLines(text) {
    if (!text) {
      return [];
    }

    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  }

  function normalizeLine(line, options) {
    if (!options || !options.ignoreWhitespace) {
      return line;
    }

    return line.replace(/\s+/g, "");
  }

  function isWhitespace(character) {
    return /\s/.test(character);
  }

  function toComparableCharacters(text, options) {
    return Array.from(normalizeLine(text || "", options));
  }

  function toLineItems(text, options) {
    return splitLines(text).map(function (line, index) {
      return {
        number: index + 1,
        text: line,
        comparable: normalizeLine(line, options),
      };
    });
  }

  function buildLcsMatrix(left, right) {
    var rows = left.length;
    var cols = right.length;
    var maxCells =
      arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : Infinity;
    var cellCount = (rows + 1) * (cols + 1);
    var matrix = new Array(rows + 1);
    var i;
    var j;

    if (cellCount > maxCells) {
      return null;
    }

    for (i = 0; i <= rows; i += 1) {
      matrix[i] = new Array(cols + 1).fill(0);
    }

    for (i = 1; i <= rows; i += 1) {
      for (j = 1; j <= cols; j += 1) {
        if (left[i - 1].comparable === right[j - 1].comparable) {
          matrix[i][j] = matrix[i - 1][j - 1] + 1;
        } else {
          matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
        }
      }
    }

    return matrix;
  }

  function countComparableLcs(leftCharacters, rightCharacters) {
    var maxCells =
      arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : Infinity;
    var left = leftCharacters.map(function (character) {
      return { comparable: character };
    });
    var right = rightCharacters.map(function (character) {
      return { comparable: character };
    });
    var matrix = buildLcsMatrix(left, right, maxCells);

    if (!matrix) {
      return null;
    }

    return matrix[left.length][right.length];
  }

  function countCommonPrefix(leftCharacters, rightCharacters) {
    var length = Math.min(leftCharacters.length, rightCharacters.length);
    var index = 0;

    while (
      index < length &&
      leftCharacters[index] === rightCharacters[index]
    ) {
      index += 1;
    }

    return index;
  }

  function countCommonSuffix(leftCharacters, rightCharacters) {
    var length = Math.min(leftCharacters.length, rightCharacters.length);
    var index = 0;

    while (
      index < length &&
      leftCharacters[leftCharacters.length - 1 - index] ===
        rightCharacters[rightCharacters.length - 1 - index]
    ) {
      index += 1;
    }

    return index;
  }

  function countSamePositions(leftCharacters, rightCharacters) {
    var length = Math.min(leftCharacters.length, rightCharacters.length);
    var count = 0;
    var index;

    for (index = 0; index < length; index += 1) {
      if (leftCharacters[index] === rightCharacters[index]) {
        count += 1;
      }
    }

    return count;
  }

  function countCharacterOverlap(leftCharacters, rightCharacters) {
    var counts = new Map();
    var overlap = 0;

    leftCharacters.forEach(function (character) {
      counts.set(character, (counts.get(character) || 0) + 1);
    });

    rightCharacters.forEach(function (character) {
      var count = counts.get(character) || 0;

      if (count > 0) {
        overlap += 1;
        counts.set(character, count - 1);
      }
    });

    return overlap;
  }

  function calculateLineSimilarity(left, right, options) {
    var settings = Object.assign({}, DEFAULT_LIMITS, options || {});
    var minimumScore =
      arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 0;
    var leftCharacters = toComparableCharacters(left.text, options);
    var rightCharacters = toComparableCharacters(right.text, options);
    var shortestLength = Math.min(leftCharacters.length, rightCharacters.length);
    var totalLength = leftCharacters.length + rightCharacters.length;
    var overlapScore;
    var lcsLength;
    var sequenceScore;
    var prefixScore;
    var suffixScore;
    var positionScore;

    if (left.comparable === right.comparable) {
      return 1;
    }

    if (leftCharacters.length === 0 || rightCharacters.length === 0) {
      return 0;
    }

    prefixScore =
      (countCommonPrefix(leftCharacters, rightCharacters) / shortestLength) * 0.85;
    suffixScore =
      (countCommonSuffix(leftCharacters, rightCharacters) / shortestLength) * 0.75;
    positionScore =
      (countSamePositions(leftCharacters, rightCharacters) / shortestLength) * 0.75;
    overlapScore = (countCharacterOverlap(leftCharacters, rightCharacters) * 2) / totalLength;

    if (
      minimumScore > 0 &&
      Math.max(prefixScore, suffixScore, positionScore, overlapScore) <
        minimumScore
    ) {
      return Math.max(prefixScore, suffixScore, positionScore);
    }

    lcsLength = countComparableLcs(
      leftCharacters,
      rightCharacters,
      settings.maxSimilarityLcsCells
    );

    if (lcsLength === null) {
      return Math.max(prefixScore, suffixScore, positionScore);
    }

    sequenceScore = (lcsLength * 2) / totalLength;

    return Math.max(sequenceScore, prefixScore, suffixScore);
  }

  function buildSimpleOperations(left, right) {
    var operations = [];
    var length = Math.max(left.length, right.length);
    var index;

    for (index = 0; index < length; index += 1) {
      if (left[index] && right[index]) {
        if (left[index].comparable === right[index].comparable) {
          operations.push({
            type: "equal",
            left: left[index],
            right: right[index],
          });
        } else {
          operations.push({
            type: "removed",
            left: left[index],
          });
          operations.push({
            type: "added",
            right: right[index],
          });
        }
      } else if (left[index]) {
        operations.push({
          type: "removed",
          left: left[index],
        });
      } else if (right[index]) {
        operations.push({
          type: "added",
          right: right[index],
        });
      }
    }

    return operations;
  }

  function buildRawOperations(left, right) {
    var maxCells =
      arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : Infinity;
    var matrix = buildLcsMatrix(left, right, maxCells);
    var operations = [];
    var i = left.length;
    var j = right.length;

    if (!matrix) {
      return {
        operations: buildSimpleOperations(left, right),
        simplified: true,
      };
    }

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && left[i - 1].comparable === right[j - 1].comparable) {
        operations.push({
          type: "equal",
          left: left[i - 1],
          right: right[j - 1],
        });
        i -= 1;
        j -= 1;
      } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
        operations.push({
          type: "added",
          right: right[j - 1],
        });
        j -= 1;
      } else if (i > 0) {
        operations.push({
          type: "removed",
          left: left[i - 1],
        });
        i -= 1;
      }
    }

    return {
      operations: operations.reverse(),
      simplified: false,
    };
  }

  function buildTrimmedOperations(left, right, options, state) {
    var settings = Object.assign({}, DEFAULT_LIMITS, options || {});
    var prefixLength = 0;
    var suffixLength = 0;
    var maxSuffixLength;
    var leftMiddle;
    var rightMiddle;
    var middleResult;
    var operations = [];
    var index;

    while (
      prefixLength < left.length &&
      prefixLength < right.length &&
      left[prefixLength].comparable === right[prefixLength].comparable
    ) {
      prefixLength += 1;
    }

    maxSuffixLength =
      Math.min(left.length, right.length) - prefixLength;

    while (
      suffixLength < maxSuffixLength &&
      left[left.length - 1 - suffixLength].comparable ===
        right[right.length - 1 - suffixLength].comparable
    ) {
      suffixLength += 1;
    }

    for (index = 0; index < prefixLength; index += 1) {
      operations.push({
        type: "equal",
        left: left[index],
        right: right[index],
      });
    }

    leftMiddle = left.slice(prefixLength, left.length - suffixLength);
    rightMiddle = right.slice(prefixLength, right.length - suffixLength);
    middleResult = buildRawOperations(
      leftMiddle,
      rightMiddle,
      settings.maxLineLcsCells
    );

    if (middleResult.simplified) {
      addWarning(
        state,
        "大きすぎるため簡易比較に切り替えました"
      );
    }

    middleResult.operations.forEach(function (operation) {
      operations.push(operation);
    });

    for (index = suffixLength; index > 0; index -= 1) {
      operations.push({
        type: "equal",
        left: left[left.length - index],
        right: right[right.length - index],
      });
    }

    return operations;
  }

  function toCharacterItems(text, options) {
    var characters = Array.from(text || "");
    var items = [];

    characters.forEach(function (character, index) {
      if (options.ignoreWhitespace && isWhitespace(character)) {
        return;
      }

      items.push({
        index: index,
        text: character,
        comparable: character,
      });
    });

    return items;
  }

  function appendSegment(segments, type, text) {
    var last = segments[segments.length - 1];

    if (!text) {
      return;
    }

    if (last && last.type === type) {
      last.text += text;
      return;
    }

    segments.push({
      type: type,
      text: text,
    });
  }

  function buildSegmentsFromIndexes(text, changedIndexes) {
    var segments = [];

    Array.from(text || "").forEach(function (character, index) {
      appendSegment(
        segments,
        changedIndexes.has(index) ? "changed" : "equal",
        character
      );
    });

    return segments;
  }

  function compareCharacters(leftText, rightText, options) {
    var settings = Object.assign(
      { ignoreWhitespace: false },
      DEFAULT_LIMITS,
      options || {}
    );
    var left = toCharacterItems(leftText, settings);
    var right = toCharacterItems(rightText, settings);
    var start = 0;
    var leftEnd = left.length - 1;
    var rightEnd = right.length - 1;
    var leftMiddle;
    var rightMiddle;
    var operationResult;
    var leftChangedIndexes = new Set();
    var rightChangedIndexes = new Set();
    var index;

    while (
      start <= leftEnd &&
      start <= rightEnd &&
      left[start].comparable === right[start].comparable
    ) {
      start += 1;
    }

    while (
      leftEnd >= start &&
      rightEnd >= start &&
      left[leftEnd].comparable === right[rightEnd].comparable
    ) {
      leftEnd -= 1;
      rightEnd -= 1;
    }

    leftMiddle = left.slice(start, leftEnd + 1);
    rightMiddle = right.slice(start, rightEnd + 1);

    if (leftMiddle.length === rightMiddle.length) {
      for (index = 0; index < leftMiddle.length; index += 1) {
        if (leftMiddle[index].comparable !== rightMiddle[index].comparable) {
          leftChangedIndexes.add(leftMiddle[index].index);
          rightChangedIndexes.add(rightMiddle[index].index);
        }
      }
    } else {
      operationResult = buildRawOperations(
        leftMiddle,
        rightMiddle,
        settings.maxCharacterLcsCells
      );

      operationResult.operations.forEach(function (operation) {
        if (operation.type === "removed") {
          leftChangedIndexes.add(operation.left.index);
        } else if (operation.type === "added") {
          rightChangedIndexes.add(operation.right.index);
        }
      });
    }

    return {
      left: buildSegmentsFromIndexes(leftText, leftChangedIndexes),
      right: buildSegmentsFromIndexes(rightText, rightChangedIndexes),
    };
  }

  function getPairScore(left, right, options) {
    var threshold = 0.38;
    var similarity = calculateLineSimilarity(left, right, options, threshold);

    return similarity >= threshold ? similarity : -1;
  }

  function createScoreGrid(removed, added, options) {
    return removed.map(function (left) {
      return added.map(function (right) {
        return getPairScore(left, right, options);
      });
    });
  }

  function alignChangeBlockSimply(removed, added, options) {
    var operations = [];
    var length = Math.max(removed.length, added.length);
    var index;

    for (index = 0; index < length; index += 1) {
      if (removed[index] && added[index]) {
        if (getPairScore(removed[index], added[index], options) >= 0) {
          operations.push({
            type: "changed",
            left: removed[index],
            right: added[index],
          });
        } else {
          operations.push({
            type: "removed",
            left: removed[index],
          });
          operations.push({
            type: "added",
            right: added[index],
          });
        }
      } else if (removed[index]) {
        operations.push({
          type: "removed",
          left: removed[index],
        });
      } else if (added[index]) {
        operations.push({
          type: "added",
          right: added[index],
        });
      }
    }

    return operations;
  }

  function alignChangeBlock(removed, added, options, state) {
    var settings = Object.assign({}, DEFAULT_LIMITS, options || {});
    var gapScore = -0.45;
    var pairCount = removed.length * added.length;
    var scoreGrid;
    var rows = new Array(removed.length + 1);
    var directions = new Array(removed.length + 1);
    var i;
    var j;
    var pairScore;
    var bestScore;
    var bestDirection;
    var operations = [];

    if (pairCount > settings.maxChangeBlockPairs) {
      addWarning(
        state,
        "大きすぎるため簡易比較に切り替えました"
      );
      return alignChangeBlockSimply(removed, added, options);
    }

    scoreGrid = createScoreGrid(removed, added, options);

    for (i = 0; i <= removed.length; i += 1) {
      rows[i] = new Array(added.length + 1).fill(0);
      directions[i] = new Array(added.length + 1).fill(null);
    }

    for (i = 1; i <= removed.length; i += 1) {
      rows[i][0] = rows[i - 1][0] + gapScore;
      directions[i][0] = "removed";
    }

    for (j = 1; j <= added.length; j += 1) {
      rows[0][j] = rows[0][j - 1] + gapScore;
      directions[0][j] = "added";
    }

    for (i = 1; i <= removed.length; i += 1) {
      for (j = 1; j <= added.length; j += 1) {
        pairScore = rows[i - 1][j - 1] + scoreGrid[i - 1][j - 1];
        bestScore = rows[i - 1][j] + gapScore;
        bestDirection = "removed";

        if (rows[i][j - 1] + gapScore >= bestScore) {
          bestScore = rows[i][j - 1] + gapScore;
          bestDirection = "added";
        }

        if (pairScore > bestScore) {
          bestScore = pairScore;
          bestDirection = "changed";
        }

        rows[i][j] = bestScore;
        directions[i][j] = bestDirection;
      }
    }

    i = removed.length;
    j = added.length;

    while (i > 0 || j > 0) {
      if (directions[i][j] === "changed") {
        operations.unshift({
          type: "changed",
          left: removed[i - 1],
          right: added[j - 1],
        });
        i -= 1;
        j -= 1;
      } else if (directions[i][j] === "added") {
        operations.unshift({
          type: "added",
          right: added[j - 1],
        });
        j -= 1;
      } else {
        operations.unshift({
          type: "removed",
          left: removed[i - 1],
        });
        i -= 1;
      }
    }

    return operations;
  }

  function makeRow(type, left, right, options) {
    var row = {
      type: type,
      leftText: left ? left.text : "",
      rightText: right ? right.text : "",
      leftNumber: left ? left.number : null,
      rightNumber: right ? right.number : null,
    };

    if (type === "changed") {
      var characterDiff = compareCharacters(row.leftText, row.rightText, options);
      row.leftSegments = characterDiff.left;
      row.rightSegments = characterDiff.right;
    }

    return row;
  }

  function lineFromLeftRow(row, options) {
    return {
      number: row.leftNumber,
      text: row.leftText,
      comparable: normalizeLine(row.leftText, options),
    };
  }

  function lineFromRightRow(row, options) {
    return {
      number: row.rightNumber,
      text: row.rightText,
      comparable: normalizeLine(row.rightText, options),
    };
  }

  function isBlankEqualRow(row) {
    return row.type === "equal" && row.leftText === "" && row.rightText === "";
  }

  function isNonEmptyAddedRow(row) {
    return row.type === "added" && row.rightText !== "";
  }

  function isNonEmptyRemovedRow(row) {
    return row.type === "removed" && row.leftText !== "";
  }

  function areRowsSimilar(leftRow, rightRow, options) {
    return (
      getPairScore(
        lineFromLeftRow(leftRow, options),
        lineFromRightRow(rightRow, options),
        options
      ) >= 0
    );
  }

  function replaceBlankSeparatedRows(first, blank, third, options) {
    if (
      isNonEmptyAddedRow(first) &&
      isBlankEqualRow(blank) &&
      isNonEmptyRemovedRow(third) &&
      areRowsSimilar(third, first, options)
    ) {
      return [
        makeRow("removed", lineFromLeftRow(blank, options), null, options),
        makeRow(
          "changed",
          lineFromLeftRow(third, options),
          lineFromRightRow(first, options),
          options
        ),
        makeRow("added", null, lineFromRightRow(blank, options), options),
      ];
    }

    if (
      isNonEmptyRemovedRow(first) &&
      isBlankEqualRow(blank) &&
      isNonEmptyAddedRow(third) &&
      areRowsSimilar(first, third, options)
    ) {
      return [
        makeRow("added", null, lineFromRightRow(blank, options), options),
        makeRow(
          "changed",
          lineFromLeftRow(first, options),
          lineFromRightRow(third, options),
          options
        ),
        makeRow("removed", lineFromLeftRow(blank, options), null, options),
      ];
    }

    return null;
  }

  function alignAcrossBlankRows(rows, options) {
    var alignedRows = [];
    var index = 0;
    var replacement;

    while (index < rows.length) {
      if (index + 2 < rows.length) {
        replacement = replaceBlankSeparatedRows(
          rows[index],
          rows[index + 1],
          rows[index + 2],
          options
        );

        if (replacement) {
          replacement.forEach(function (row) {
            alignedRows.push(row);
          });
          index += 3;
          continue;
        }
      }

      alignedRows.push(rows[index]);
      index += 1;
    }

    return alignedRows;
  }

  function flushChangeBlock(block, rows, options, state) {
    var removed = [];
    var added = [];

    block.forEach(function (operation) {
      if (operation.type === "removed") {
        removed.push(operation.left);
      } else if (operation.type === "added") {
        added.push(operation.right);
      }
    });

    alignChangeBlock(removed, added, options, state).forEach(function (operation) {
      rows.push(makeRow(operation.type, operation.left, operation.right, options));
    });
  }

  function combineOperations(operations, options, state) {
    var rows = [];
    var changeBlock = [];

    operations.forEach(function (operation) {
      if (operation.type === "equal") {
        if (changeBlock.length > 0) {
          flushChangeBlock(changeBlock, rows, options, state);
          changeBlock = [];
        }

        rows.push(makeRow("equal", operation.left, operation.right, options));
      } else {
        changeBlock.push(operation);
      }
    });

    if (changeBlock.length > 0) {
      flushChangeBlock(changeBlock, rows, options, state);
    }

    return rows;
  }

  function countRows(rows) {
    return rows.reduce(
      function (counts, row) {
        if (row.type === "equal") {
          counts.equal += 1;
        } else if (row.type === "changed") {
          counts.changed += 1;
          counts.total += 1;
        } else if (row.type === "added") {
          counts.added += 1;
          counts.total += 1;
        } else if (row.type === "removed") {
          counts.removed += 1;
          counts.total += 1;
        }

        return counts;
      },
      {
        total: 0,
        equal: 0,
        changed: 0,
        added: 0,
        removed: 0,
      }
    );
  }

  function compareLines(leftText, rightText, options) {
    var settings = Object.assign(
      { ignoreWhitespace: false },
      DEFAULT_LIMITS,
      options || {}
    );
    var state = {
      warnings: [],
    };
    var left = toLineItems(leftText, settings);
    var right = toLineItems(rightText, settings);
    var operations = buildTrimmedOperations(left, right, settings, state);
    var rows = alignAcrossBlankRows(
      combineOperations(operations, settings, state),
      settings
    );
    var counts = countRows(rows);

    return {
      rows: rows,
      counts: counts,
      leftLineCount: left.length,
      rightLineCount: right.length,
      isEqual: counts.total === 0,
      options: settings,
      warnings: state.warnings,
      simplified: state.warnings.length > 0,
    };
  }

  window.DiffDockDiff = {
    compareCharacters: compareCharacters,
    compareLines: compareLines,
    splitLines: splitLines,
  };
})();
