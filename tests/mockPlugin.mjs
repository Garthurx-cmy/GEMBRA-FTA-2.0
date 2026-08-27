import path from 'node:path';
const root = process.cwd();
export const mockPlugin = {name:'firebase-test-only',setup(b){
 b.onResolve({filter:/^heic2any$/},()=>({path:'heic2any',namespace:'image-test-only'}));
 b.onLoad({filter:/.*/,namespace:'image-test-only'},()=>({contents:'export default async function(){throw new Error("HEIC conversion is not exercised by this test adapter");}',loader:'js'}));
 b.onResolve({filter:/^firebase\/firestore$/},()=>({path:path.join(root,'tests/firestoreMock.ts')}));
 b.onResolve({filter:/^firebase\/app$/},()=>({path:'firebase-app',namespace:'firebase-app-test-only'}));
 b.onLoad({filter:/.*/,namespace:'firebase-app-test-only'},()=>({contents:'export function initializeApp(){throw new Error("Firebase app creation is forbidden in tests");} export async function deleteApp(){}',loader:'js'}));
 b.onResolve({filter:/^firebase\/auth$/},()=>({path:path.join(root,'tests/authMock.ts')}));
 b.onResolve({filter:/firebase$/},a=>a.path.startsWith('.')?({path:path.join(root,'tests/firebaseMock.ts')}):null);
}};
