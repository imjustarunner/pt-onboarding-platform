// Template fields use PDF points from the bottom left; DOM overlays use top left.
const positioned = value => value?.x != null && value?.y != null && Number.isFinite(Number(value.x)) && Number.isFinite(Number(value.y));
export const canFillOnDocument = field => field?.type === 'radio'
  ? !!field.options?.length && field.options.every(positioned)
  : positioned(field);
export function pdfFieldWidgets(fields, pageCount) {
  return fields.filter(canFillOnDocument).flatMap(field => {
    const shapes = field.type === 'radio' ? field.options : [field];
    return shapes.map((shape,index) => ({ ...field, ...shape, fieldId:field.id, widgetId:`${field.id}-${index}`, type:field.type, label:shape.label || field.label || 'Document field', option:field.type === 'radio' ? shape.value ?? shape.label : undefined, page:Number(shape.page || field.page || pageCount), width:Number(shape.width || field.width || (field.type === 'checkbox' || field.type === 'radio' ? 20 : 120)), height:Number(shape.height || field.height || (field.type === 'checkbox' || field.type === 'radio' ? 20 : 24)), x:Number(shape.x), y:Number(shape.y) }));
  });
}
export function pdfFieldStyle(field, width, height) {
  return {left:`${field.x/width*100}%`,top:`${(height-field.y-field.height)/height*100}%`,width:`${field.width/width*100}%`,height:`${field.height/height*100}%`,fontSize:`${Math.min(14,Math.max(8,field.height-4))/width*100}cqw`};
}
