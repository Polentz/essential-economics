<?php
/**
 * Newsletter subscription endpoint (Brevo, double opt-in).
 *
 * Receives the subscribe form (name, email) and asks Brevo to send its double opt-in email.
 * The person is added to the newsletter list only after clicking the confirmation link.
 * Optionally also emails the site owner about the new sign-up.
 *
 * Responds with JSON when called from JavaScript (fetch), and redirects back to the page
 * with ?subscribe=success|error when the form is submitted without JavaScript.
 */

declare(strict_types=1);

$configFile = __DIR__ . '/config.php';
if (!is_file($configFile)) {
    respond(500, 'The subscription service is not configured yet.');
}
$config = require $configFile;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    respond(405, 'Method not allowed.');
}

// Honeypot: a hidden checkbox real visitors never tick. Bots that do get a fake success.
if (!empty($_POST['hp_check'])) {
    error_log('Subscribe: honeypot triggered, sign-up ignored');
    respond(200, 'Thank you! Please check your inbox and click the link to confirm your subscription.');
}

$name = trim((string) ($_POST['name'] ?? ''));
$email = trim((string) ($_POST['email'] ?? ''));

if (mb_strlen($name) > 100 || preg_match('/[\r\n]/', $name)) {
    respond(422, 'Please enter a valid name.');
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 254) {
    respond(422, 'Please enter a valid email address.');
}
if (($_POST['consent'] ?? '') !== '1') {
    respond(422, 'Please tick the box to confirm that you agree to receive our newsletter.');
}

if (isRateLimited($_SERVER['REMOTE_ADDR'] ?? 'unknown', $config['rate_limit_per_hour'] ?? 5)) {
    respond(429, 'Too many attempts. Please try again later.');
}

// 1. Ask Brevo to send the double opt-in confirmation email
$attributes = $name !== '' ? ['FIRSTNAME' => $name] : new stdClass();
[$status, $body] = brevoRequest($config, '/contacts/doubleOptinConfirmation', [
    'email' => $email,
    'attributes' => $attributes,
    'includeListIds' => [(int) $config['list_id']],
    'templateId' => (int) $config['doi_template_id'],
    'redirectionUrl' => $config['confirmation_url'],
]);

// An address that is already known is answered like a new one, so the form never reveals who subscribed
$alreadyKnown = $status === 400 && ($body['code'] ?? '') === 'duplicate_parameter';

// Brevo's answer, without the email address: helps tell "email sent" from "already subscribed"
error_log("Subscribe: Brevo double opt-in responded {$status}" . ($alreadyKnown ? ' (contact already exists, no email sent)' : ''));

if (($status < 200 || $status >= 300) && !$alreadyKnown) {
    error_log("Subscribe: Brevo double opt-in failed ({$status}) " . json_encode($body));
    respond(502, 'Sorry, something went wrong. Please try again later.');
}

// 2. Optional notification to the site owner (sign-up still pending confirmation)
if (!empty($config['owner_email'])) {
    $safeName = htmlspecialchars($name !== '' ? $name : '(not given)', ENT_QUOTES, 'UTF-8');
    $safeEmail = htmlspecialchars($email, ENT_QUOTES, 'UTF-8');

    [$notifyStatus, $notifyBody] = brevoRequest($config, '/smtp/email', [
        'sender' => ['name' => $config['sender_name'], 'email' => $config['sender_email']],
        'to' => [['email' => $config['owner_email']]],
        'replyTo' => ['email' => $email],
        'subject' => 'New newsletter sign-up (awaiting confirmation)',
        'htmlContent' => '<p>Someone signed up for the newsletter. They will be added to the list once they '
            . 'confirm through the email Brevo sent them.</p>'
            . "<p><strong>Name:</strong> {$safeName}<br><strong>Email:</strong> {$safeEmail}</p>"
            . '<p>' . gmdate('j F Y, H:i') . ' UTC</p>',
    ]);

    // The subscription itself already worked, so a failed notification is only logged
    if ($notifyStatus < 200 || $notifyStatus >= 300) {
        error_log("Subscribe: owner notification failed ({$notifyStatus}) " . json_encode($notifyBody));
    }
}

respond(200, 'Thank you! Please check your inbox and click the link to confirm your subscription.');


/** Calls the Brevo API. Returns [HTTP status, decoded response body]. */
function brevoRequest(array $config, string $path, array $payload): array
{
    $curl = curl_init('https://api.brevo.com/v3' . $path);
    curl_setopt_array($curl, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => [
            'api-key: ' . $config['brevo_api_key'],
            'Content-Type: application/json',
            'Accept: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode($payload),
    ]);

    $response = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $error = curl_error($curl);

    $body = json_decode((string) $response, true) ?: [];
    if ($error !== '') {
        $body['curl_error'] = $error;
    }
    return [$status, $body];
}

/** Allows a limited number of sign-ups per visitor (IP address) per hour. */
function isRateLimited(string $ip, int $limit): bool
{
    $file = sys_get_temp_dir() . '/subscribe_' . hash('sha256', $ip);
    $now = time();
    $attempts = is_file($file) ? (json_decode((string) file_get_contents($file), true) ?: []) : [];
    $attempts = array_filter($attempts, fn ($time) => $time > $now - 3600);

    if (count($attempts) >= $limit) {
        return true;
    }

    $attempts[] = $now;
    file_put_contents($file, json_encode(array_values($attempts)), LOCK_EX);
    return false;
}

/** Ends the request with a JSON message, or a redirect back to the page for plain form posts. */
function respond(int $status, string $message): never
{
    $wantsJson = str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json');

    if (!$wantsJson) {
        $result = $status === 200 ? 'success' : 'error';
        header('Location: ../index.html?subscribe=' . $result . '#subscribe', true, 303);
        exit;
    }

    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => $status === 200, 'message' => $message]);
    exit;
}
