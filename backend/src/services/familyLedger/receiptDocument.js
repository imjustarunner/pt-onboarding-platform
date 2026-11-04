import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { COPAY_CANCELLATION_NOTICE } from './receiptEmailPolicy.js';

const printable=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,'-').replace(/[^\x20-\x7E]/g,' ');
export async function brandedReceiptPdf(receipt) {
  const pdf=await PDFDocument.create(),regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const money=value=>new Intl.NumberFormat('en-US',{style:'currency',currency:receipt.currency||'USD'}).format(Number(value||0)/100);
  const blue=rgb(.086,.24,.44),muted=rgb(.37,.44,.52);
  let page,y;
  const addPage=()=>{page=pdf.addPage([612,792]);page.drawRectangle({x:0,y:0,width:612,height:792,color:rgb(1,1,1)});page.drawRectangle({x:0,y:684,width:612,height:108,color:blue});
    page.drawText(printable(receipt.portalBrand||'Payment receipt'),{x:48,y:751,size:12,font:bold,color:rgb(1,1,1)});
    const name=printable(receipt.agencyName||'Organization');let size=22;while(bold.widthOfTextAtSize(name,size)>516&&size>9)size--;
    page.drawText(name,{x:48,y:716,size,font:bold,color:rgb(1,1,1)});y=650;};
  const line=(value,{size=11,font=regular,color=rgb(.12,.18,.25)}={})=>{let text='';for(const word of printable(value).split(/\s+/)){
    if(font.widthOfTextAtSize(`${text} ${word}`,size)>516&&text){if(y<65)addPage();page.drawText(text,{x:48,y,size,font,color});y-=size+6;text=word;}else text=text?`${text} ${word}`:word;
  }if(y<65)addPage();page.drawText(text,{x:48,y,size,font,color});y-=size+10;};
  addPage();line('PAYMENT RECEIPT',{size:12,font:bold,color:muted});y-=14;line(money(receipt.amountCents),{size:30,font:bold,color:blue});
  const details=[['Receipt',receipt.receiptNumber],['Payment date',String(receipt.receivedAt).slice(0,10)],['Responsible payer',receipt.payerName],['Client',receipt.clientName],['Service',receipt.service],['Service date',receipt.serviceDate],['Charge type',receipt.responsibilityType],['Balance reference',receipt.balanceReference],['Payment method',receipt.method]];
  for(const [label,value] of details)if(value!=null&&value!=='')line(`${label}: ${value}`);
  if(receipt.shareCents!=null)line(`Assigned share: ${money(receipt.shareCents)} | Previously paid: ${money(receipt.previouslyPaidCents)}`);
  if(receipt.remainingAtPaymentCents!=null)line(`Remaining at time of payment: ${money(receipt.remainingAtPaymentCents)}`);
  if(receipt.serviceCode)line(`Service code: ${receipt.serviceCode} | Agreed price: ${money(receipt.unitAmountCents)} per ${receipt.priceBasis}`);
  if(receipt.refundedCents)line(`Refunded: ${money(receipt.refundedCents)} | Net payment: ${money(receipt.netPaidCents)}`,{font:bold});
  if(receipt.credit?.isCredit){line(`Available credit: ${money(receipt.credit.availableCents)} | Applied to later visits: ${money(receipt.credit.appliedCents)}`,{font:bold});if(receipt.credit.refundRequested)line('The related credit is held while your refund request is reviewed.');}
  y-=10;
  if(receipt.responsibilityType==='Copay'){line('Canceled-session copays',{font:bold,color:blue});line(COPAY_CANCELLATION_NOTICE,{size:9,color:muted});}
  line('This receipt records a payment, not a new bill or an insurance superbill. Your secure portal shows current balances, refunds and applied credits.',{size:9,color:muted});
  const pages=pdf.getPages();for(let i=0;i<pages.length;i++)pages[i].drawText(`${printable(receipt.receiptNumber)}  |  ${i+1} / ${pages.length}`,{x:48,y:31,size:9,font:regular,color:muted});
  pdf.setTitle(`Payment receipt ${printable(receipt.receiptNumber)}`);pdf.setAuthor(printable(receipt.agencyName));
  return Buffer.from(await pdf.save());
}
