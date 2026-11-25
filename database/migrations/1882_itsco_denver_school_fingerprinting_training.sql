-- Seed an editable ITSCO module in the agency's on-demand catalog.
-- Individual training and service-focus assignments are managed separately.
START TRANSACTION;

SET @fingerprinting_agency_id = (
  SELECT id
  FROM agencies
  WHERE slug = 'itsco' AND organization_type = 'agency'
    AND is_active = TRUE AND COALESCE(is_archived, FALSE) = FALSE
  LIMIT 1
);
SET @fingerprinting_title = 'Denver School-Based Counseling – Fingerprinting';
SET @fingerprinting_description = 'Use Cabiond to order and schedule fingerprint cards for an ITSCO Denver school-based counseling assignment.';

INSERT INTO modules (
  agency_id, title, description, assignment_level, estimated_time_minutes,
  is_active, publish_status, is_shared, is_always_accessible, is_public
)
SELECT @fingerprinting_agency_id, @fingerprinting_title, @fingerprinting_description,
       'agency', 5, TRUE, 'published', FALSE, FALSE, FALSE
WHERE @fingerprinting_agency_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM modules
    WHERE agency_id = @fingerprinting_agency_id AND title = @fingerprinting_title
  );

SET @fingerprinting_module_id = (
  SELECT id
  FROM modules
  WHERE agency_id = @fingerprinting_agency_id AND title = @fingerprinting_title
    AND description = @fingerprinting_description AND assignment_level = 'agency'
    AND is_active = TRUE AND publish_status = 'published'
    AND COALESCE(is_archived, FALSE) = FALSE
    AND COALESCE(is_always_accessible, FALSE) = FALSE
    AND COALESCE(is_public, FALSE) = FALSE
  LIMIT 1
);

INSERT INTO module_content (module_id, content_type, title, content_data, order_index)
SELECT @fingerprinting_module_id, 'text', 'Order and attend your fingerprinting appointment',
       JSON_OBJECT('content', '<p>Use this guide when People Operations directs you to order a physical fingerprint card for an ITSCO Denver school-based counseling assignment. Follow the instructions for your assignment if People Operations gives you a different process.</p>
<ol>
  <li>
    <h3>Sign in to Cabiond</h3>
    <p>Open the <a href="https://abi.cabiond.com/login" target="_blank" rel="noopener noreferrer">Cabiond fingerprinting portal</a>. If this is your first time, choose <strong>Create an Account</strong> at the top right. Otherwise, enter your username and password and choose <strong>Sign In</strong>.</p>
  </li>
  <li>
    <h3>Start an order and choose a location</h3>
    <p>In <strong>Order History</strong>, choose <strong>Place New Order</strong>. Under <strong>Order Options</strong>, choose <strong>Fingerprint Location</strong>. Search by ZIP code, select a convenient site, and choose <strong>Next</strong>.</p>
  </li>
  <li>
    <h3>Book your appointment</h3>
    <p>On <strong>Schedule Appointment</strong>, pick an available date and time for the site you selected, then continue.</p>
  </li>
  <li>
    <h3>Answer the billing code question</h3>
    <p>Choose <strong>No</strong> under <strong>Do you have a Billing Code?</strong> unless People Operations gave you a code for this order.</p>
  </li>
  <li>
    <h3>Choose the fingerprint card service</h3>
    <p>Under <strong>Service Types</strong>, select <strong>Fingerprinting Cards</strong>. For the reason, choose the option stating that your employer or agency requested a fingerprint card for a non-CBI purpose. Enter <strong>1</strong> for the number of copies.</p>
  </li>
  <li>
    <h3>Enter your information and the shipping address</h3>
    <p>Complete the requested personal information in Cabiond. In <strong>Shipping Address</strong>, enter the following unless People Operations gives you an updated address.</p>
    <ul>
      <li><strong>Company Name</strong> ITSCO</li>
      <li><strong>Attention To</strong> Rachel Finch</li>
      <li><strong>Address</strong> 437 Windchime Place</li>
      <li><strong>City, State, ZIP Code</strong> Colorado Springs, CO 80919</li>
      <li><strong>Country</strong> United States of America</li>
    </ul>
    <p>Under <strong>Shipping Options</strong>, choose <strong>First Class Mail (Free)</strong> and continue.</p>
  </li>
  <li>
    <h3>Complete fingerprint information and review the order</h3>
    <p>Fill in the requested fields under <strong>Fingerprint Information</strong>. On <strong>Review Order</strong>, check the appointment location, date, and time, the service and card quantity, the shipping address, and the total. Ask People Operations before submitting if a required field or payment instruction is unclear.</p>
  </li>
  <li>
    <h3>Submit and save the confirmation</h3>
    <p>Complete <strong>Payment Details</strong> as directed for your assignment. Save your <strong>Order Confirmation</strong> and appointment details. To reschedule, sign in to Cabiond and use <strong>Change Appointment</strong> in <strong>Appointment Details</strong>.</p>
  </li>
  <li>
    <h3>Attend your appointment</h3>
    <p>Go to the location on your confirmation with a government-issued photo ID. Keep your confirmation for your records and check with People Operations for the next step in your school clearance. <a href="https://coloradofingerprinting.com/faqs/" target="_blank" rel="noopener noreferrer">Colorado Fingerprinting appointment and ID information</a></p>
  </li>
</ol>'), 0
WHERE @fingerprinting_module_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM module_content WHERE module_id = @fingerprinting_module_id);

INSERT INTO agency_public_modules (agency_id, module_id)
SELECT @fingerprinting_agency_id, @fingerprinting_module_id
WHERE @fingerprinting_module_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agency_public_modules
    WHERE agency_id = @fingerprinting_agency_id AND module_id = @fingerprinting_module_id
  );

COMMIT;
