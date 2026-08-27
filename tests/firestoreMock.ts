// Test-only in-memory adapter. Never connected to Firebase.
export const state = { docs: new Map<string, any>(), observers: [] as any[], writes: [] as any[], failPrefix: "", autoEmit: false, deletes: [] as string[], reads: [] as string[] };
export class Sentinel { toDate() { return new Date(); } }
export const serverTimestamp = () => new Sentinel();
export const deleteField = () => new Sentinel();
export const collection = (_db: any, ...parts: string[]) => ({ path: parts.join("/") });
export const doc = (_db: any, ...parts: string[]) => ({ path: parts.join("/") });
export const query = (ref: any, ...constraints: any[]) => ({ ...ref, constraints });
export const where = (...args: any[]) => ({ kind: "where", args });
export const limit = (value: number) => ({ kind: "limit", value });
export const orderBy = (...args: any[]) => ({ kind: "orderBy", args });
export const startAfter = (...args: any[]) => ({ kind: "startAfter", args });
export function snapshot(ref: any, metadata = { fromCache: false, hasPendingWrites: false }) {
  if (ref.path.split("/").length % 2 === 0) return { id: ref.path.split("/").at(-1), metadata, exists: () => state.docs.has(ref.path), data: () => state.docs.get(ref.path) };
  const docs = [...state.docs].filter(([key]) => key.startsWith(ref.path+"/") && key.split("/").length === ref.path.split("/").length+1)
    .filter(([,value]) => (ref.constraints || []).every((c: any) => c.kind !== "where" || (c.args[1] === "==" ? value[c.args[0]] === c.args[2] : c.args[2].includes(value[c.args[0]]))))
    .map(([key,value]) => ({ id: key.split("/").at(-1), data: () => value }));
  return { docs, empty: docs.length === 0, metadata };
}
export const emit = (path?: string, metadata?: any) => state.observers.filter(o => o.active && (!path || o.ref.path === path)).forEach(o => o.next(snapshot(o.ref, metadata)));
export function onSnapshot(ref: any, ...args: any[]) {
  const next = typeof args[0] === "function" ? args[0] : args[1];
  const error = typeof args[0] === "function" ? args[1] : args[2];
  const observer = { ref, next, error, active: true };
  state.observers.push(observer);
  if (state.autoEmit) setTimeout(() => { if (observer.active) next(snapshot(ref)); }, 0);
  return () => { observer.active = false; };
}
export async function setDoc(ref: any, data: any, options?: any) {
  if (state.failPrefix && ref.path.startsWith(state.failPrefix)) throw Object.assign(new Error("test write failure"), { code: "permission-denied" });
  state.writes.push({ path: ref.path, data, options });
  state.docs.set(ref.path, options?.merge ? { ...state.docs.get(ref.path), ...data } : data);
  if (state.autoEmit) { emit(ref.path); emit(ref.path.split("/").slice(0,-1).join("/")); }
}
export const updateDoc = (ref: any, data: any) => setDoc(ref, data, { merge: true });
export async function deleteDoc(ref: any) { state.deletes.push(ref.path); state.docs.delete(ref.path); }
export async function getDoc(ref: any) { return snapshot(ref); }
export async function getDocs(ref: any) { state.reads.push(ref.path); return snapshot(ref); }
export const writeBatch = () => ({ set: () => {}, update: () => {}, delete: () => {}, commit: async () => {} });
