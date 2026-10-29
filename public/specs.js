/* Specification fields for a bike model. One list, loaded by the page (window.CISpecs) and imported by the
   server (lib/validate.js), so the form, the matrix, the CSV and the API all agree.
   The sections and labels follow the specification block on a Brompton product page
   (e.g. brompton.com C Line 12-speed), plus a few fields competitors publish and Brompton does not. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CISpecs = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // k = key stored on the model, l = label shown, n = max length
  const SECTIONS = [
    { id: 'frame', label: 'Frame and fork', fields: [
      { k: 'material', l: 'Material', n: 80 },
      { k: 'mainFrame', l: 'Main frame', n: 200 },
      { k: 'rearFrame', l: 'Rear frame', n: 200 },
      { k: 'fork', l: 'Fork', n: 200 },
      { k: 'headset', l: 'Headset', n: 120 }] },
    { id: 'fit', label: 'Fit and contact points', fields: [
      { k: 'handlebars', l: 'Handlebar options', n: 120 },
      { k: 'grips', l: 'Grips', n: 200 },
      { k: 'seatpost', l: 'Seatpost', n: 200 },
      { k: 'saddle', l: 'Saddle', n: 160 },
      { k: 'seatclamp', l: 'Seat clamp', n: 160 },
      { k: 'hingeClamps', l: 'Hinge clamps', n: 160 },
      { k: 'pedals', l: 'Pedals', n: 200 },
      { k: 'riderHeight', l: 'Rider height range', n: 80 }] },
    { id: 'drive', label: 'Drivetrain', fields: [
      { k: 'drivetrain', l: 'Drivetrain', n: 200 },
      { k: 'chainset', l: 'Chainset', n: 200 },
      { k: 'bottomBracket', l: 'Bottom bracket', n: 120 },
      { k: 'shifters', l: 'Shifters', n: 160 },
      { k: 'sprockets', l: 'Sprockets', n: 120 },
      { k: 'derailleur', l: 'Derailleur / hub gear', n: 200 }] },
    { id: 'wheels', label: 'Wheels and tyres', fields: [
      { k: 'rearWheel', l: 'Rear wheel', n: 200 },
      { k: 'frontWheel', l: 'Front wheel', n: 200 },
      { k: 'tyres', l: 'Tyres', n: 200 },
      { k: 'tubes', l: 'Tubes / valve', n: 120 },
      { k: 'rollerWheels', l: 'Roller wheels', n: 120 }] },
    { id: 'brakes', label: 'Brakes', fields: [
      { k: 'brakes', l: 'Brakes', n: 200 }] },
    { id: 'kit', label: 'Equipment', fields: [
      { k: 'mudguards', l: 'Mudguards', n: 120 },
      { k: 'lighting', l: 'Lighting', n: 160 },
      { k: 'rack', l: 'Rack', n: 120 },
      { k: 'frontCarrier', l: 'Front carrier', n: 200 },
      { k: 'colours', l: 'Colours', n: 200 },
      { k: 'warranty', l: 'Warranty', n: 120 }] }
  ];
  const TEXT = SECTIONS.flatMap((s) => s.fields);
  const KEYS = TEXT.map((f) => f.k);
  return { SECTIONS, TEXT, KEYS };
});
