(function () {
  "use strict";

  var engine = window.DiffDockDiff;
  var COLLAPSE_CONTEXT_LINES = 2;
  var MAX_FILE_BYTES = 5 * 1024 * 1024;
  var elements = {};
  var pendingFrame = null;
  var state = {
    currentDiffIndex: -1,
    currentDiffElement: null,
    diffElements: [],
    exportStatusTimer: null,
    result: null,
  };

  function getElement(id) {
    return document.getElementById(id);
  }

  function formatLineCount(count) {
    return String(count) + " 行";
  }

  function setText(element, value) {
    element.textContent = String(value);
  }

  function getPaneInput(side) {
    return side === "left" ? elements.leftInput : elements.rightInput;
  }

  function getPaneFileInput(side) {
    return side === "left" ? elements.leftFileInput : elements.rightFileInput;
  }

  function getPaneFileName(side) {
    return side === "left" ? elements.leftFileName : elements.rightFileName;
  }

  function setPaneFileName(side, label) {
    var element = getPaneFileName(side);

    element.textContent = label;
    element.title = label;
  }

  function swapPaneFileNames() {
    var leftName = elements.leftFileName.textContent;
    var rightName = elements.rightFileName.textContent;

    setPaneFileName("left", rightName);
    setPaneFileName("right", leftName);
  }

  function resetPaneFileInputs() {
    elements.leftFileInput.value = "";
    elements.rightFileInput.value = "";
  }

  function appendSegments(cell, segments, side) {
    segments.forEach(function (segment) {
      var span = document.createElement("span");

      span.className = "inline-segment";
      if (segment.type === "changed") {
        span.classList.add("inline-change", "inline-change-" + side);
      }

      span.textContent = segment.text;
      cell.appendChild(span);
    });
  }

  function createCell(className, value, fallback, segments, side) {
    var cell = document.createElement("div");
    var text = value === null || value === undefined ? "" : String(value);

    cell.className = className;

    if (segments && segments.length > 0) {
      appendSegments(cell, segments, side);
    } else {
      cell.textContent = text || fallback || "";
    }

    if (!text && fallback) {
      cell.classList.add("is-empty");
    }

    return cell;
  }

  function isDiffRow(row) {
    return row.type !== "equal";
  }

  function createRowItem(row) {
    return {
      kind: "row",
      row: row,
    };
  }

  function getLineRange(rows, side) {
    // getLineRange is only called on runs of "equal" rows, which always carry
    // sequential, non-null line numbers, so the ends give the range directly.
    var key = side === "left" ? "leftNumber" : "rightNumber";
    var first = rows.length > 0 ? rows[0][key] : null;
    var last = rows.length > 0 ? rows[rows.length - 1][key] : null;

    return {
      first: first === undefined ? null : first,
      last: last === undefined ? null : last,
    };
  }

  function createCollapsedItem(rows) {
    return {
      kind: "collapsed",
      count: rows.length,
      leftRange: getLineRange(rows, "left"),
      rightRange: getLineRange(rows, "right"),
    };
  }

  function pushRowItems(items, rows) {
    rows.forEach(function (row) {
      items.push(createRowItem(row));
    });
  }

  function pushCollapsedItem(items, rows) {
    if (rows.length > 0) {
      items.push(createCollapsedItem(rows));
    }
  }

  function appendEqualRun(items, rows, isLeading, isTrailing) {
    var context = COLLAPSE_CONTEXT_LINES;
    var visibleLimit = context * 2 + 1;
    var hiddenRows;

    if (rows.length <= visibleLimit) {
      pushRowItems(items, rows);
      return;
    }

    if (isLeading) {
      hiddenRows = rows.slice(0, rows.length - context);
      pushCollapsedItem(items, hiddenRows);
      pushRowItems(items, rows.slice(rows.length - context));
      return;
    }

    if (isTrailing) {
      pushRowItems(items, rows.slice(0, context));
      hiddenRows = rows.slice(context);
      pushCollapsedItem(items, hiddenRows);
      return;
    }

    pushRowItems(items, rows.slice(0, context));
    hiddenRows = rows.slice(context, rows.length - context);
    pushCollapsedItem(items, hiddenRows);
    pushRowItems(items, rows.slice(rows.length - context));
  }

  function buildVisibleItems(rows, collapseEqualRows) {
    var items = [];
    var index = 0;
    var hasDiffBefore = false;
    var runStart;
    var runRows;
    var isTrailing;

    if (!collapseEqualRows) {
      rows.forEach(function (row) {
        items.push(createRowItem(row));
      });
      return items;
    }

    while (index < rows.length) {
      if (rows[index].type !== "equal") {
        items.push(createRowItem(rows[index]));
        hasDiffBefore = true;
        index += 1;
        continue;
      }

      runStart = index;
      while (index < rows.length && rows[index].type === "equal") {
        index += 1;
      }

      runRows = rows.slice(runStart, index);
      isTrailing = index >= rows.length;
      appendEqualRun(items, runRows, !hasDiffBefore, isTrailing);
    }

    return items;
  }

  function formatRange(range) {
    if (!range || range.first === null) {
      return "";
    }

    if (range.first === range.last) {
      return String(range.first);
    }

    return String(range.first) + "-" + String(range.last);
  }

  function describeCollapsedItem(item) {
    var ranges = [];
    var leftRange = formatRange(item.leftRange);
    var rightRange = formatRange(item.rightRange);

    if (leftRange) {
      ranges.push("左 " + leftRange);
    }
    if (rightRange) {
      ranges.push("右 " + rightRange);
    }

    return (
      "同一行 " +
      String(item.count) +
      " 行を省略" +
      (ranges.length > 0 ? "（" + ranges.join(" / ") + "）" : "")
    );
  }

  function renderCollapsedRow(item) {
    var rowElement = document.createElement("div");
    var cell = document.createElement("div");

    rowElement.className = "diff-row row-collapsed";
    rowElement.setAttribute("role", "row");
    cell.className = "collapsed-cell";
    cell.textContent = describeCollapsedItem(item);
    rowElement.appendChild(cell);

    return rowElement;
  }

  function renderDataRow(row, diffIndex) {
    var rowElement = document.createElement("div");
    rowElement.className = "diff-row row-" + row.type;
    rowElement.setAttribute("role", "row");

    if (diffIndex !== null) {
      rowElement.dataset.diffIndex = String(diffIndex);
    }

    rowElement.appendChild(
      createCell("line-number left-line", row.leftNumber, "")
    );
    rowElement.appendChild(
      createCell(
        "code-cell left-code",
        row.leftText,
        row.rightNumber ? "" : " ",
        row.leftSegments,
        "left"
      )
    );
    rowElement.appendChild(
      createCell("line-number right-line", row.rightNumber, "")
    );
    rowElement.appendChild(
      createCell(
        "code-cell right-code",
        row.rightText,
        row.leftNumber ? "" : " ",
        row.rightSegments,
        "right"
      )
    );

    return rowElement;
  }

  function renderEmptyState(message) {
    var empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = message;
    elements.diffGrid.replaceChildren(empty);
    state.diffElements = [];
    state.currentDiffIndex = -1;
    updateDiffPosition();
  }

  function renderDiffRows(rows, isEqual) {
    var fragment;
    var items;
    var diffElements = [];
    var diffIndex = 0;

    if (isEqual) {
      renderEmptyState("一致しています");
      return;
    }

    items = buildVisibleItems(rows, elements.collapseEqual.checked);
    fragment = document.createDocumentFragment();

    items.forEach(function (item) {
      var rowElement;

      if (item.kind === "collapsed") {
        fragment.appendChild(renderCollapsedRow(item));
        return;
      }

      if (isDiffRow(item.row)) {
        rowElement = renderDataRow(item.row, diffIndex);
        fragment.appendChild(rowElement);
        diffElements.push(rowElement);
        diffIndex += 1;
        return;
      }

      fragment.appendChild(renderDataRow(item.row, null));
    });

    elements.diffGrid.replaceChildren(fragment);
    state.diffElements = diffElements;
    updateDiffPosition();
  }

  function renderSummary(result) {
    var counts = result.counts;
    var warnings = result.warnings || [];

    setText(elements.countTotal, counts.total);
    setText(elements.countChanged, counts.changed);
    setText(elements.countAdded, counts.added);
    setText(elements.countRemoved, counts.removed);
    setText(elements.countEqual, counts.equal);
    setText(elements.leftLineCount, formatLineCount(result.leftLineCount));
    setText(elements.rightLineCount, formatLineCount(result.rightLineCount));

    elements.statusBanner.classList.toggle("has-diff", !result.isEqual);
    elements.statusBanner.classList.toggle("has-warning", warnings.length > 0);
    elements.statusBanner.textContent =
      warnings.length > 0
        ? warnings[0]
        : result.isEqual
          ? "一致しています"
          : "差分があります";
  }

  function updateDiffPosition() {
    var total = state.diffElements.length;
    var labelIndex = state.currentDiffIndex >= 0 ? state.currentDiffIndex + 1 : 0;
    var nextElement =
      state.currentDiffIndex >= 0 ? state.diffElements[state.currentDiffIndex] : null;

    elements.prevDiffButton.disabled = total === 0;
    elements.nextDiffButton.disabled = total === 0;
    elements.diffPosition.textContent = String(labelIndex) + " / " + String(total);

    if (state.currentDiffElement && state.currentDiffElement !== nextElement) {
      state.currentDiffElement.classList.remove("is-current-diff");
    }
    if (nextElement) {
      nextElement.classList.add("is-current-diff");
    }
    state.currentDiffElement = nextElement;
  }

  function setCurrentDiffIndex(index, shouldScroll) {
    var total = state.diffElements.length;
    var target;

    if (total === 0) {
      state.currentDiffIndex = -1;
      updateDiffPosition();
      return;
    }

    if (index < 0) {
      index = total - 1;
    } else if (index >= total) {
      index = 0;
    }

    state.currentDiffIndex = index;
    updateDiffPosition();

    if (shouldScroll) {
      target = state.diffElements[index];
      target.scrollIntoView({
        block: "center",
        behavior: "smooth",
      });
    }
  }

  function jumpDiff(direction) {
    if (state.diffElements.length === 0) {
      return;
    }

    if (state.currentDiffIndex === -1) {
      setCurrentDiffIndex(direction > 0 ? 0 : state.diffElements.length - 1, true);
      return;
    }

    setCurrentDiffIndex(state.currentDiffIndex + direction, true);
  }

  function updateDiff() {
    var result = engine.compareLines(elements.leftInput.value, elements.rightInput.value, {
      ignoreWhitespace: elements.ignoreWhitespace.checked,
    });

    pendingFrame = null;
    state.currentDiffIndex = -1;
    state.result = result;
    renderSummary(result);
    renderDiffRows(result.rows, result.isEqual);
  }

  function scheduleUpdate() {
    if (pendingFrame !== null) {
      cancelAnimationFrame(pendingFrame);
    }

    pendingFrame = requestAnimationFrame(updateDiff);
  }

  function flushPendingUpdate() {
    if (pendingFrame !== null) {
      cancelAnimationFrame(pendingFrame);
      updateDiff();
    } else if (!state.result) {
      updateDiff();
    }
  }

  function swapInputs() {
    var leftValue = elements.leftInput.value;

    elements.leftInput.value = elements.rightInput.value;
    elements.rightInput.value = leftValue;
    swapPaneFileNames();
    resetPaneFileInputs();
    scheduleUpdate();
    elements.leftInput.focus();
  }

  function clearInputs() {
    elements.leftInput.value = "";
    elements.rightInput.value = "";
    resetPaneFileInputs();
    setPaneFileName("left", "直接入力");
    setPaneFileName("right", "直接入力");
    scheduleUpdate();
    elements.leftInput.focus();
  }

  function showExportStatus(message, isError) {
    elements.exportStatus.textContent = message;
    elements.exportStatus.classList.toggle("has-error", Boolean(isError));

    if (state.exportStatusTimer !== null) {
      clearTimeout(state.exportStatusTimer);
    }

    state.exportStatusTimer = setTimeout(function () {
      elements.exportStatus.textContent = "";
      elements.exportStatus.classList.remove("has-error");
      state.exportStatusTimer = null;
    }, 3200);
  }

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeMarkdownCell(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/\\/g, "\\\\")
      .replace(/\|/g, "\\|")
      .replace(/\r/g, "")
      .replace(/\n/g, "<br>");
  }

  function getExportResult() {
    flushPendingUpdate();
    return state.result;
  }

  function getTypeLabel(type) {
    if (type === "changed") {
      return "変更";
    }
    if (type === "added") {
      return "追加";
    }
    if (type === "removed") {
      return "削除";
    }
    return "同一";
  }

  function getPanePathLabel(side, fallback) {
    var name = getPaneFileName(side).textContent;

    if (
      !name ||
      name === "直接入力" ||
      name === "読み込み中..." ||
      name === "読み込み失敗"
    ) {
      return fallback;
    }

    return name;
  }

  function buildUnifiedDiff(result) {
    var lines = [];
    var leftRange = result.leftLineCount === 0 ? "0,0" : "1," + result.leftLineCount;
    var rightRange =
      result.rightLineCount === 0 ? "0,0" : "1," + result.rightLineCount;

    lines.push("--- a/" + getPanePathLabel("left", "left"));
    lines.push("+++ b/" + getPanePathLabel("right", "right"));
    lines.push("@@ -" + leftRange + " +" + rightRange + " @@");

    result.rows.forEach(function (row) {
      if (row.type === "equal") {
        lines.push(" " + row.leftText);
      } else if (row.type === "removed") {
        lines.push("-" + row.leftText);
      } else if (row.type === "added") {
        lines.push("+" + row.rightText);
      } else if (row.type === "changed") {
        lines.push("-" + row.leftText);
        lines.push("+" + row.rightText);
      }
    });

    return lines.join("\n") + "\n";
  }

  function buildMarkdown(result) {
    var counts = result.counts;
    var lines = [
      "# DiffDock Export",
      "",
      "- 差分: " + counts.total,
      "- 変更: " + counts.changed,
      "- 追加: " + counts.added,
      "- 削除: " + counts.removed,
      "- 同一: " + counts.equal,
      "",
      "| 種別 | 左行 | 左 | 右行 | 右 |",
      "| --- | ---: | --- | ---: | --- |",
    ];

    result.rows.forEach(function (row) {
      lines.push(
        "| " +
          getTypeLabel(row.type) +
          " | " +
          (row.leftNumber || "") +
          " | " +
          escapeMarkdownCell(row.leftText) +
          " | " +
          (row.rightNumber || "") +
          " | " +
          escapeMarkdownCell(row.rightText) +
          " |"
      );
    });

    return lines.join("\n") + "\n";
  }

  function buildHtml(result) {
    var counts = result.counts;
    var rows = result.rows
      .map(function (row) {
        return (
          '<tr class="' +
          escapeHtml(row.type) +
          '">' +
          "<td>" +
          escapeHtml(getTypeLabel(row.type)) +
          "</td><td class=\"line\">" +
          escapeHtml(row.leftNumber || "") +
          "</td><td><pre>" +
          escapeHtml(row.leftText) +
          "</pre></td><td class=\"line\">" +
          escapeHtml(row.rightNumber || "") +
          "</td><td><pre>" +
          escapeHtml(row.rightText) +
          "</pre></td></tr>"
        );
      })
      .join("\n");

    return (
      "<!doctype html>\n" +
      "<html lang=\"ja\">\n" +
      "<head>\n" +
      "<meta charset=\"utf-8\">\n" +
      "<title>DiffDock Export</title>\n" +
      "<style>\n" +
      "body{font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Yu Gothic',sans-serif;margin:24px;color:#1f2328;}\n" +
      "table{width:100%;border-collapse:collapse;font-size:13px;}\n" +
      "th,td{border:1px solid #d6d9de;padding:6px 8px;vertical-align:top;}\n" +
      "th{background:#f4f5f7;text-align:left;}.line{text-align:right;color:#67707e;width:56px;}\n" +
      "pre{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-family:'SF Mono',Menlo,Consolas,monospace;}\n" +
      ".added{background:#e8f6ee;}.removed{background:#fdecec;}.changed{background:#fff5d6;}\n" +
      "</style>\n" +
      "</head>\n" +
      "<body>\n" +
      "<h1>DiffDock Export</h1>\n" +
      "<p>差分 " +
      counts.total +
      " / 変更 " +
      counts.changed +
      " / 追加 " +
      counts.added +
      " / 削除 " +
      counts.removed +
      " / 同一 " +
      counts.equal +
      "</p>\n" +
      "<table>\n" +
      "<thead><tr><th>種別</th><th>左行</th><th>左</th><th>右行</th><th>右</th></tr></thead>\n" +
      "<tbody>\n" +
      rows +
      "\n</tbody>\n" +
      "</table>\n" +
      "</body>\n" +
      "</html>\n"
    );
  }

  function padTime(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function getTimestamp() {
    // Use local wall-clock time so the filename matches when the user saved it,
    // rather than UTC (which can land on the previous calendar day).
    var now = new Date();

    return (
      now.getFullYear() +
      "-" +
      padTime(now.getMonth() + 1) +
      "-" +
      padTime(now.getDate()) +
      "T" +
      padTime(now.getHours()) +
      "-" +
      padTime(now.getMinutes()) +
      "-" +
      padTime(now.getSeconds())
    );
  }

  function buildExportPayload() {
    var result = getExportResult();
    var format = elements.exportFormat.value;
    var timestamp = getTimestamp();

    if (format === "markdown") {
      return {
        content: buildMarkdown(result),
        fileName: "diffdock-" + timestamp + ".md",
        label: "Markdown",
        mime: "text/markdown",
      };
    }

    if (format === "html") {
      return {
        content: buildHtml(result),
        fileName: "diffdock-" + timestamp + ".html",
        label: "HTML",
        mime: "text/html",
      };
    }

    return {
      content: buildUnifiedDiff(result),
      fileName: "diffdock-" + timestamp + ".diff",
      label: "Unified diff",
      mime: "text/x-diff",
    };
  }

  function fallbackCopyText(text) {
    return new Promise(function (resolve, reject) {
      var textarea = document.createElement("textarea");
      var copied;

      textarea.value = text;
      textarea.setAttribute("readonly", "readonly");
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      textarea.style.left = "-9999px";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus({
        preventScroll: true,
      });
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);

      try {
        copied = document.execCommand("copy");
      } catch (error) {
        copied = false;
      }

      document.body.removeChild(textarea);

      if (copied) {
        resolve();
      } else {
        reject(new Error("copy failed"));
      }
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        return fallbackCopyText(text);
      });
    }

    return fallbackCopyText(text);
  }

  function copyExport() {
    var payload = buildExportPayload();

    copyText(payload.content)
      .then(function () {
        showExportStatus(payload.label + " をコピーしました", false);
      })
      .catch(function () {
        showExportStatus("コピーできませんでした", true);
      });
  }

  function saveViaDownload(payload) {
    var blob = new Blob([payload.content], {
      type: payload.mime + ";charset=utf-8",
    });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");

    link.href = url;
    link.download = payload.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
    showExportStatus(payload.label + " をダウンロードしました", false);
  }

  function saveExport() {
    var payload = buildExportPayload();
    var runtime = window.diffDockRuntime;

    // In Electron, save through the main process so we can report the actual
    // result (saved / canceled / failed) instead of assuming success.
    if (runtime && typeof runtime.saveExport === "function") {
      runtime
        .saveExport({
          content: payload.content,
          fileName: payload.fileName,
        })
        .then(function (outcome) {
          if (!outcome || outcome.status === "canceled") {
            showExportStatus("保存をキャンセルしました", false);
            return;
          }
          if (outcome.status === "error") {
            showExportStatus("保存できませんでした", true);
            return;
          }
          showExportStatus(payload.label + " を保存しました", false);
        })
        .catch(function () {
          showExportStatus("保存できませんでした", true);
        });
      return;
    }

    saveViaDownload(payload);
  }

  function looksBinary(text) {
    // A NUL byte is a strong signal that the file is not plain text.
    return text.indexOf("\u0000") !== -1;
  }

  function readFileIntoPane(file, side) {
    var reader;

    if (!file) {
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      getPaneFileInput(side).value = "";
      showExportStatus(
        "ファイルが大きすぎます（上限 " +
          Math.round(MAX_FILE_BYTES / (1024 * 1024)) +
          "MB）",
        true
      );
      return;
    }

    reader = new FileReader();
    setPaneFileName(side, "読み込み中...");

    reader.addEventListener("load", function () {
      var text = String(reader.result || "");

      if (looksBinary(text)) {
        getPaneFileInput(side).value = "";
        setPaneFileName(side, "直接入力");
        showExportStatus("バイナリファイルは読み込めません", true);
        return;
      }

      getPaneInput(side).value = text;
      getPaneFileInput(side).value = "";
      setPaneFileName(side, file.name);
      scheduleUpdate();
      getPaneInput(side).focus();
    });

    reader.addEventListener("error", function () {
      getPaneFileInput(side).value = "";
      setPaneFileName(side, "読み込み失敗");
      showExportStatus("ファイルを読み込めませんでした", true);
    });

    reader.readAsText(file);
  }

  function hasFileTransfer(event) {
    var types = event.dataTransfer && event.dataTransfer.types;
    var index;

    if (!types) {
      return false;
    }

    for (index = 0; index < types.length; index += 1) {
      if (types[index] === "Files") {
        return true;
      }
    }

    return false;
  }

  function bindDropZone(element, side) {
    // Track enter/leave depth instead of relying on event.relatedTarget, which
    // is null on internal dragleave in several browsers and causes the
    // highlight to flicker as the pointer crosses child elements.
    var dragDepth = 0;

    element.addEventListener("dragenter", function (event) {
      if (!hasFileTransfer(event)) {
        return;
      }
      event.preventDefault();
      dragDepth += 1;
      element.classList.add("is-drag-over");
    });

    element.addEventListener("dragover", function (event) {
      if (!hasFileTransfer(event)) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    });

    element.addEventListener("dragleave", function (event) {
      if (!hasFileTransfer(event)) {
        return;
      }
      dragDepth -= 1;
      if (dragDepth <= 0) {
        dragDepth = 0;
        element.classList.remove("is-drag-over");
      }
    });

    element.addEventListener("drop", function (event) {
      var files;

      if (!hasFileTransfer(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      dragDepth = 0;
      element.classList.remove("is-drag-over");
      files = event.dataTransfer.files;
      if (files && files.length > 0) {
        readFileIntoPane(files[0], side);
      }
    });
  }

  function preventWindowFileDrop(event) {
    if (hasFileTransfer(event)) {
      event.preventDefault();
    }
  }

  function bindEvents() {
    elements.leftInput.addEventListener("input", scheduleUpdate);
    elements.rightInput.addEventListener("input", scheduleUpdate);
    elements.ignoreWhitespace.addEventListener("change", scheduleUpdate);
    elements.collapseEqual.addEventListener("change", scheduleUpdate);
    elements.prevDiffButton.addEventListener("click", function () {
      jumpDiff(-1);
    });
    elements.nextDiffButton.addEventListener("click", function () {
      jumpDiff(1);
    });
    elements.copyExportButton.addEventListener("click", copyExport);
    elements.saveExportButton.addEventListener("click", saveExport);
    elements.swapButton.addEventListener("click", swapInputs);
    elements.clearButton.addEventListener("click", clearInputs);

    elements.leftFileButton.addEventListener("click", function () {
      elements.leftFileInput.click();
    });
    elements.rightFileButton.addEventListener("click", function () {
      elements.rightFileInput.click();
    });
    elements.leftFileInput.addEventListener("change", function () {
      readFileIntoPane(elements.leftFileInput.files[0], "left");
    });
    elements.rightFileInput.addEventListener("change", function () {
      readFileIntoPane(elements.rightFileInput.files[0], "right");
    });

    bindDropZone(elements.leftPane, "left");
    bindDropZone(elements.rightPane, "right");
    document.addEventListener("dragover", preventWindowFileDrop);
    document.addEventListener("drop", preventWindowFileDrop);
  }

  function cacheElements() {
    elements = {
      collapseEqual: getElement("collapseEqual"),
      copyExportButton: getElement("copyExportButton"),
      clearButton: getElement("clearButton"),
      countAdded: getElement("countAdded"),
      countChanged: getElement("countChanged"),
      countEqual: getElement("countEqual"),
      countRemoved: getElement("countRemoved"),
      countTotal: getElement("countTotal"),
      diffGrid: getElement("diffGrid"),
      diffPosition: getElement("diffPosition"),
      exportFormat: getElement("exportFormat"),
      exportStatus: getElement("exportStatus"),
      ignoreWhitespace: getElement("ignoreWhitespace"),
      leftFileButton: getElement("leftFileButton"),
      leftFileInput: getElement("leftFileInput"),
      leftFileName: getElement("leftFileName"),
      leftInput: getElement("leftInput"),
      leftLineCount: getElement("leftLineCount"),
      leftPane: getElement("leftPane"),
      nextDiffButton: getElement("nextDiffButton"),
      prevDiffButton: getElement("prevDiffButton"),
      rightFileButton: getElement("rightFileButton"),
      rightFileInput: getElement("rightFileInput"),
      rightFileName: getElement("rightFileName"),
      rightInput: getElement("rightInput"),
      rightLineCount: getElement("rightLineCount"),
      rightPane: getElement("rightPane"),
      saveExportButton: getElement("saveExportButton"),
      statusBanner: getElement("statusBanner"),
      swapButton: getElement("swapButton"),
    };
  }

  function init() {
    cacheElements();
    if (window.diffDockRuntime && window.diffDockRuntime.isElectron) {
      document.body.classList.add("is-electron");
    }
    bindEvents();
    updateDiff();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
