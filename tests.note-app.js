"use strict";

var assert = require("assert");
var NotesCore = require("./app.js");

function memoryStorage(initialValue) {
  var store = Object.assign({}, initialValue || {});
  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem: function (key, value) {
      store[key] = String(value);
    }
  };
}

async function test(name, fn) {
  try {
    await fn();
    console.log("✓ " + name);
  } catch (error) {
    console.error("✗ " + name);
    throw error;
  }
}

function makeElement() {
  return {
    className: "",
    textContent: "",
    type: "",
    title: "",
    children: [],
    listeners: {},
    hidden: false,
    appendChild: function (child) {
      this.children.push(child);
    },
    addEventListener: function (type, handler) {
      this.listeners[type] = handler;
    },
    setAttribute: function (name, value) {
      this[name] = value;
    },
    focus: function () {
      if (this.listeners.focus) {
        return this.listeners.focus();
      }
    },
    click: function () {
      if (this.listeners.click) {
        return this.listeners.click({ stopPropagation: function () {} });
      }
    }
  };
}

function makeListElement() {
  var element = makeElement();
  Object.defineProperty(element, "innerHTML", {
    get: function () {
      return "";
    },
    set: function () {
      this.children = [];
    }
  });
  return element;
}

function makeNodes() {
  return {
    newNote: makeElement(),
    emptyNewNote: makeElement(),
    searchInput: Object.assign(makeElement(), { value: "" }),
    titleInput: Object.assign(makeElement(), { value: "" }),
    contentInput: Object.assign(makeElement(), { value: "" }),
    deleteNote: makeElement(),
    submitNote: makeElement(),
    noteCount: { textContent: "" },
    notesList: makeListElement(),
    emptyState: { hidden: false },
    editor: { hidden: true },
    saveStatus: { textContent: "" },
    updatedAt: { textContent: "" }
  };
}

async function withFakeDocument(fn) {
  var originalDocument = global.document;
  global.document = { createElement: makeElement };
  try {
    return await fn();
  } finally {
    global.document = originalDocument;
  }
}

async function main() {
  await test("createNote creates a valid empty note", function () {
    var note = NotesCore.createNote();
    assert.ok(note.id);
    assert.strictEqual(note.title, "无标题笔记");
    assert.strictEqual(note.content, "");
    assert.ok(note.createdAt);
    assert.ok(note.updatedAt);
  });

  await test("normalizeNotes removes invalid records and fills defaults", function () {
    var notes = NotesCore.normalizeNotes([
      null,
      { id: "a", title: "", content: 123, createdAt: "2026-01-01T00:00:00.000Z" },
      { title: "missing id" }
    ]);
    assert.strictEqual(notes.length, 1);
    assert.strictEqual(notes[0].id, "a");
    assert.strictEqual(notes[0].title, "无标题笔记");
    assert.strictEqual(notes[0].content, "123");
  });

  await test("filterNotes searches title and content in updated order", function () {
    var notes = [
      { id: "old", title: "会议", content: "项目记录", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "new", title: "灵感", content: "会议复盘", createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" }
    ];
    var result = NotesCore.filterNotes(notes, "会议");
    assert.deepStrictEqual(result.map(function (note) { return note.id; }), ["new", "old"]);
  });

  await test("deriveTitle uses the first non-empty content line", function () {
    assert.strictEqual(NotesCore.deriveTitle("\n  今天的计划  \n第二行"), "今天的计划");
    assert.strictEqual(NotesCore.deriveTitle(""), "无标题笔记");
  });

  await test("saveNotes and loadNotes round-trip through storage", function () {
    var storage = memoryStorage();
    var note = { id: "x", title: "标题", content: "内容", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" };
    NotesCore.saveNotes(storage, [note]);
    assert.deepStrictEqual(NotesCore.loadNotes(storage), [note]);
  });

  await test("loadNotes survives broken JSON", function () {
    var storage = memoryStorage({ "light-notes:v1": "{bad json" });
    assert.deepStrictEqual(NotesCore.loadNotes(storage), []);
  });

  await test("NoteApp submit button saves the selected note immediately", async function () {
    await withFakeDocument(async function () {
      var storage = memoryStorage();
      var nodes = makeNodes();
      var app = new NotesCore.NoteApp({ storage: storage, nodes: nodes });
      await app.ready;
      app.notes = [{ id: "a", title: "标题", content: "内容", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }];
      app.selectedId = "a";
      await nodes.submitNote.click();
      assert.strictEqual(nodes.saveStatus.textContent, "已提交");
      assert.strictEqual(NotesCore.loadNotes(storage)[0].title, "标题");
    });
  });

  await test("NoteApp opens the editor with the clicked note content", async function () {
    await withFakeDocument(async function () {
      var notes = [
        { id: "old", title: "旧笔记", content: "旧内容", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
        { id: "new", title: "新笔记", content: "新内容", createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" }
      ];
      var storage = memoryStorage({ "light-notes:v1": JSON.stringify(notes) });
      var nodes = makeNodes();
      var app = new NotesCore.NoteApp({ storage: storage, nodes: nodes });
      await app.ready;
      assert.strictEqual(nodes.notesList.children.length, 2);
      nodes.notesList.children[0].children[0].click();
      assert.strictEqual(nodes.editor.hidden, false);
      assert.strictEqual(nodes.emptyState.hidden, true);
      assert.strictEqual(nodes.titleInput.value, "新笔记");
      assert.strictEqual(nodes.contentInput.value, "新内容");
    });
  });

  await test("NoteApp deletes a note from the left list delete button", async function () {
    await withFakeDocument(async function () {
      var notes = [
        { id: "old", title: "旧笔记", content: "旧内容", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
        { id: "new", title: "新笔记", content: "新内容", createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" }
      ];
      var storage = memoryStorage({ "light-notes:v1": JSON.stringify(notes) });
      var nodes = makeNodes();
      var app = new NotesCore.NoteApp({ storage: storage, nodes: nodes });
      await app.ready;
      assert.strictEqual(nodes.notesList.children[0].children[1].className, "note-delete");
      nodes.notesList.children[0].children[1].click();
      assert.strictEqual(app.notes.length, 1);
      assert.strictEqual(app.notes[0].id, "old");
    });
  });

  await test("remote stores keep different app instances synchronized", async function () {
    await withFakeDocument(async function () {
      var sharedNotes = [
        { id: "a", title: "浏览器一", content: "初始内容", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }
      ];
      function sharedStore() {
        return {
          remote: true,
          load: function () {
            return Promise.resolve(NotesCore.normalizeNotes(sharedNotes));
          },
          save: function (notes) {
            sharedNotes = NotesCore.normalizeNotes(notes);
            return Promise.resolve(sharedNotes);
          }
        };
      }
      var firstNodes = makeNodes();
      var secondNodes = makeNodes();
      var first = new NotesCore.NoteApp({ store: sharedStore(), nodes: firstNodes });
      var second = new NotesCore.NoteApp({ store: sharedStore(), nodes: secondNodes });
      await Promise.all([first.ready, second.ready]);
      first.notes[0] = Object.assign({}, first.notes[0], { title: "同步后的标题", updatedAt: "2026-01-02T00:00:00.000Z" });
      await first.persistNow();
      await second.refreshFromStore();
      assert.strictEqual(second.nodes.titleInput.value, "同步后的标题");
      clearInterval(first.syncTimer);
      clearInterval(second.syncTimer);
    });
  });
}

main().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
