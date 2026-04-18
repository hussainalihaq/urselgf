# Ameer Global Full-Stack Website

This repo now includes:
- Frontend pages based on your provided designs (`/home`, `/products`, `/about`, `/contact`)
- Backend APIs (`/api/health`, `/api/products`, `/api/newsletter`, `/api/contact`)
- File-based data storage in `data/*.json`

## Run locally

```bash
npm start
```

Server runs on `http://localhost:3000` by default.

## Routes

- `GET /` -> Home
- `GET /home`
- `GET /products`
- `GET /about`
- `GET /contact`
- `GET /api/health`
- `GET /api/products`
- `POST /api/newsletter`
- `POST /api/contact`

## API payloads

### `POST /api/newsletter`
```json
{ "email": "user@example.com" }
```

### `POST /api/contact`
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "subject": "Need quote",
  "message": "Please share pricing and shipment timeline."
}
```
