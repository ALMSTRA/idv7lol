# Security policy

## Scope

idv7lol is experimental software that draws on the instrument cluster of a BMW iDrive 7 (MGU)
car through the open-source `cluster-render` service. It never writes to the car's firmware,
ECUs, odometer or safety systems, and it must never be able to do so. Anything that could:

- hide or alter a factory warning, telltale or pop-up,
- make the cluster, head unit or HUD restart or freeze,
- send or alter driving-related commands,
- leak vehicle identifiers (VIN, position, logs with personal data),
- execute untrusted code on the head unit or on a user's computer through a theme file,

is a security issue for this project.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Use GitHub's private vulnerability reporting on this repository
(the "Security" tab, then "Report a vulnerability"). If that is not available to you, open an issue
titled "Security contact request" without details and a maintainer will reach out.

Include:

- the version or commit,
- the head unit software version if relevant (e.g. the I-step shown in the car),
- steps to reproduce, and whether a vehicle was involved,
- the impact you observed.

We aim to acknowledge reports within 7 days and to publish a fix or mitigation as soon as it
has been verified. Credit is given to reporters who want it.

## Supported versions

Only the latest release and the `main` branch receive fixes.

## Safety reminder

Test on a parked car, under supervision, with a way to disable idv7lol (the app's own
"Deactivate" action, the MGU Store's uninstall, or SSH). Never test while driving.
