import path from 'node:path';
const root = process.cwd();
export const mockPlugin = {name:'firebase-test-only',setup(b){
 b.onResolve({filter:/^heic2any$/},()=>({path:'heic2any',namespace:'image-test-only'}));
 b.onLoad({filter:/.*/,namespace:'image-test-only'},()=>({contents:'export default async function(){throw new Error("HEIC conversion is not exercised by this test adapter");}',loader:'js'}));
 b.onResolve({filter:/^firebase\/firestore$/},()=>({path:path.join(root,'tests/firestoreMock.ts')}));
 b.onResolve({filter:/^firebase\/auth$/},()=>({path:path.join(root,'tests/authMock.ts')}));
 b.onResolve({filter:/firebase$/},a=>a.path.startsWith('.')?({path:path.join(root,'tests/firebaseMock.ts')}):null);
}};
