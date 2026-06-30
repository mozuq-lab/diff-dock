(function () {
  "use strict";

  var engine = window.DiffDockDiff;
  var elements = {};
  var pendingFrame = null;

  function getElement(id) {
    return document.getElementById(id);
  }

  function formatLineCount(count) {
    return String(count) + " 行";
  }

  function setText(element, value) {
    element.textContent = String(value);
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

  function renderEmptyState(message) {
    var empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = message;
    elements.diffGrid.replaceChildren(empty);
  }

  function renderDiffRows(rows, isEqual) {
    var fragment;

    if (isEqual) {
      renderEmptyState("一致しています");
      return;
    }

    fragment = document.createDocumentFragment();

    rows.forEach(function (row) {
      var rowElement = document.createElement("div");
      rowElement.className = "diff-row row-" + row.type;
      rowElement.setAttribute("role", "row");

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

      fragment.appendChild(rowElement);
    });

    elements.diffGrid.replaceChildren(fragment);
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

  function updateDiff() {
    var result = engine.compareLines(elements.leftInput.value, elements.rightInput.value, {
      ignoreWhitespace: elements.ignoreWhitespace.checked,
    });

    pendingFrame = null;
    renderSummary(result);
    renderDiffRows(result.rows, result.isEqual);
  }

  function scheduleUpdate() {
    if (pendingFrame !== null) {
      cancelAnimationFrame(pendingFrame);
    }

    pendingFrame = requestAnimationFrame(updateDiff);
  }

  function swapInputs() {
    var leftValue = elements.leftInput.value;

    elements.leftInput.value = elements.rightInput.value;
    elements.rightInput.value = leftValue;
    scheduleUpdate();
    elements.leftInput.focus();
  }

  function clearInputs() {
    elements.leftInput.value = "";
    elements.rightInput.value = "";
    scheduleUpdate();
    elements.leftInput.focus();
  }

  function bindEvents() {
    elements.leftInput.addEventListener("input", scheduleUpdate);
    elements.rightInput.addEventListener("input", scheduleUpdate);
    elements.ignoreWhitespace.addEventListener("change", scheduleUpdate);
    elements.swapButton.addEventListener("click", swapInputs);
    elements.clearButton.addEventListener("click", clearInputs);
  }

  function cacheElements() {
    elements = {
      leftInput: getElement("leftInput"),
      rightInput: getElement("rightInput"),
      ignoreWhitespace: getElement("ignoreWhitespace"),
      swapButton: getElement("swapButton"),
      clearButton: getElement("clearButton"),
      leftLineCount: getElement("leftLineCount"),
      rightLineCount: getElement("rightLineCount"),
      statusBanner: getElement("statusBanner"),
      countTotal: getElement("countTotal"),
      countChanged: getElement("countChanged"),
      countAdded: getElement("countAdded"),
      countRemoved: getElement("countRemoved"),
      countEqual: getElement("countEqual"),
      diffGrid: getElement("diffGrid"),
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
