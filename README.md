# API Labyrinth

## Description

This repository contains a serverless proxy designed for testing purposes. It unifies multiple backend microservices under a single HTTPS endpoint, allowing frontend applications (like QR code scanners) to securely call these services without running into mixed content issues.

## Purpose

The main goal is to overcome the challenge where an HTTPS frontend cannot directly call HTTP backend services. By deploying this proxy on Vercel, we ensure secure communication, even when the backend services are hosted on AWS without HTTPS.

## How It Works

- **Frontend**: Calls the unified HTTPS proxy endpoint.
- **Proxy**: Routes requests to the appropriate HTTP backend service.
- **Backend**: Remains on AWS, accessible via HTTP, but is shielded from direct frontend access.

## Services Supported

- User Service
- Transaction Service
- Lead Service
- IPFS Microservice
- Pinata Service
- Survey Plan Service

## Usage

1. **Deploy the proxy** on Vercel.
2. **Update frontend** API calls to use the proxy endpoint.
3. **Test** the integration, ensuring that all requests are securely routed to the backend services.

## Note

This setup is intended **only for testing and development**. It helps simulate a secure environment without deploying all services to Vercel.

## Disclaimer

"Even though this might sound like a cringe approach, this is only for testing."
