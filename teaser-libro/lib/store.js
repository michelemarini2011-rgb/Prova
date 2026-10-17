'use strict';
// Archivio minimale su file JSON: adatto a qualche migliaio di utenti, nessuna
// dipendenza esterna. Le scritture sono serializzate e atomiche (file temporaneo
// + rename), così un crash a metà salvataggio non corrompe i dati.

const fs = require('fs');
const path = require('path');

const EMPTY = () => ({ users: [], progress: {}, messages: [] });

class Store {
  constructor(file) {
    this.file = file;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) {
      this.data = { ...EMPTY(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } else {
      this.data = EMPTY();
      this.flushSync();
    }
    this.pending = null;
    this.dirty = false;
  }

  flushSync() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  // Salvataggio differito: più modifiche ravvicinate producono una sola scrittura.
  save() {
    this.dirty = true;
    if (this.pending) return;
    this.pending = setTimeout(() => {
      this.pending = null;
      if (!this.dirty) return;
      this.dirty = false;
      try {
        this.flushSync();
      } catch (err) {
        console.error('Errore nel salvataggio dei dati:', err);
        this.dirty = true;
      }
    }, 200);
  }

  close() {
    if (this.pending) clearTimeout(this.pending);
    this.pending = null;
    if (this.dirty) this.flushSync();
    this.dirty = false;
  }

  findUserByEmail(email) {
    return this.data.users.find((u) => u.email === email);
  }

  findUserById(id) {
    return this.data.users.find((u) => u.id === id);
  }
}

module.exports = { Store };
