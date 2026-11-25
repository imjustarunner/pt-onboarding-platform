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
    WHERE agency_id = @fingerprinting_agency_id
      AND title = CONVERT(@fingerprinting_title USING utf8mb4) COLLATE utf8mb4_unicode_ci
  );

SET @fingerprinting_module_id = (
  SELECT id
  FROM modules
  WHERE agency_id = @fingerprinting_agency_id
    AND title = CONVERT(@fingerprinting_title USING utf8mb4) COLLATE utf8mb4_unicode_ci
    AND description = CONVERT(@fingerprinting_description USING utf8mb4) COLLATE utf8mb4_unicode_ci
    AND assignment_level = 'agency'
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
    <h3>Open Cabiond</h3>
    <p>Open the <a href="https://abi.cabiond.com/login" target="_blank" rel="noopener noreferrer">Cabiond fingerprinting portal</a>.</p>
  </li>
  <li>
    <h3>Create an account if you need one</h3>
    <p>Choose <strong>Create an Account</strong> at the top right and complete registration.</p>
  </li>
  <li>
    <h3>Sign in to your account</h3>
    <p>Enter your username and password and choose <strong>Sign In</strong>.</p>
  </li>
  <li>
    <h3>Place a new order</h3>
    <p>In <strong>Order History</strong>, choose <strong>Place New Order</strong>.</p>
  </li>
  <li>
    <h3>Choose the location closest to home</h3>
    <p>Under <strong>Order Options</strong>, choose <strong>Fingerprint Location</strong>. Search by your home ZIP code, select the closest site to your home, and choose <strong>Next</strong>. When Cabiond opens <strong>Schedule Appointment</strong>, pick an available date and time to continue.</p>
  </li>
  <li>
    <h3>Select No for the billing code</h3>
    <p>Under <strong>Do you have a Billing Code?</strong>, choose <strong>No</strong>.</p>
  </li>
  <li>
    <h3>Order one fingerprint card</h3>
    <p>Under <strong>Service Types</strong>, select <strong>Fingerprinting Cards</strong>. For the reason, choose <strong>My employer/agency requested a fingerprint card for non-CBI</strong>. Enter <strong>1</strong> for the number of copies.</p>
  </li>
  <li>
    <h3>Ship the card to ITSCO</h3>
    <p>Complete the requested personal information in Cabiond. In <strong>Shipping Address</strong>, enter the following.</p>
    <ul>
      <li><strong>Company Name</strong> ITSCO</li>
      <li><strong>Attention To</strong> Rachel Finch</li>
      <li><strong>Address</strong> 437 Windchime Place</li>
      <li><strong>City, State, ZIP Code</strong> Colorado Springs, CO 80919</li>
      <li><strong>Country</strong> United States of America</li>
    </ul>
    <p>Choose <strong>First Class Mail (Free)</strong>. Get Rachel Finch’s approval before choosing faster shipping.</p>
  </li>
  <li>
    <h3>Complete your appointment and notify Rachel Finch</h3>
    <p>Finish <strong>Fingerprint Information</strong>, review your appointment and order details, and follow the payment instructions for your assignment. Save your <strong>Order Confirmation</strong>. If you need a different date or time, use <strong>Change Appointment</strong> in <strong>Appointment Details</strong>.</p>
    <p>Bring a government-issued photo ID to the appointment. After fingerprinting is complete, notify Rachel Finch and send her any confirmation you received. <a href="https://coloradofingerprinting.com/faqs/" target="_blank" rel="noopener noreferrer">Colorado Fingerprinting appointment and ID information</a></p>
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
