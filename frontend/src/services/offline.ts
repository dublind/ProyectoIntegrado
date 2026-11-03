type Item = { id: string; username: string; path: string; body: unknown };
async function open() { return new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('pi_reparto_offline',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('acciones',{keyPath:'id'});
  request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
}); }
async function transaction<T>(mode:IDBTransactionMode, fn:(store:IDBObjectStore)=>IDBRequest<T>) {
  const db=await open();return new Promise<T>((resolve,reject)=>{
    const tx=db.transaction('acciones',mode);const request=fn(tx.objectStore('acciones'));
    tx.oncomplete=()=>{db.close();resolve(request.result);};tx.onerror=()=>{db.close();reject(tx.error);};
  });
}
export const queue = {
  add: (item:Item)=>transaction('readwrite',s=>s.put(item)),
  all: ()=>transaction<Item[]>('readonly',s=>s.getAll()),
  remove: (id:string)=>transaction('readwrite',s=>s.delete(id)),
  clear: ()=>transaction('readwrite',s=>s.clear())
};
