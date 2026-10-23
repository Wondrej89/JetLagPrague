import {DeductionComputer} from '../../geo-resolver/src/deduction/geometry';
import type {GameDataRelease} from '../../geo-core/src/index';
import type {Deduction,TargetPolicy} from '../../game-core/src/index';
let computer:DeductionComputer|undefined;
self.onmessage=(event:MessageEvent<{id:number;release?:GameDataRelease;deductions?:Deduction[];target?:TargetPolicy}>)=>{
 const {id,release,deductions,target}=event.data;
 try {
  if(release){computer=new DeductionComputer(release);self.postMessage({id,ready:true});}
  else {if(!computer||!deductions||!target)throw new Error('Nejprve načtěte publikovaný katalog.');self.postMessage({id,result:computer.compute(deductions,target)});}
 }catch(error){self.postMessage({id,error:(error as Error).message});}
};
