'use strict';
/**
 * The public keys the online store's catalog is signed with (ECDSA P-256, PEM). A catalog signed
 * by any one of them is taken (store.js). The first signs the catalog today; the second is kept
 * apart, to sign with if the first is ever lost. The private keys are not in this repository.
 */
module.exports = [
  [
    '-----BEGIN PUBLIC KEY-----',
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEsgkqHIivfeDRUfN74UmDnByvwZ9a',
    'SvbhcIaAIH+AxN+Xiig3FDGDv9ncagoOL0RjzZCFFkqxHQFYNzuw+omKfg==',
    '-----END PUBLIC KEY-----',
    '',
  ].join('\n'),
  [
    '-----BEGIN PUBLIC KEY-----',
    'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEcx4wribsQgEBfEdooOBx0g90xNev',
    'PAO/aL7j1auWQcaSdV7ZITJfQBXNSpEq60I6pKBEpyLhWOs2N0MIkdkRKg==',
    '-----END PUBLIC KEY-----',
    '',
  ].join('\n'),
];
