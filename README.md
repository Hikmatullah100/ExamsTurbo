# ExamsTurbo – IT Certification Vendor Directory

A responsive frontend starter project for an IT certification vendor directory.

## Run in Visual Studio Code

1. Extract the `certification-directory.zip` archive.
2. Open the `certification-directory` folder in VS Code.
3. Install the **Live Server** extension if it is not already installed.
4. Right-click `index.html` and select **Open with Live Server**.

The project uses CDN-hosted Bootstrap, Font Awesome, and Google Fonts, so an internet connection is required for those external assets.

## Project structure

```text
certification-directory/
├── index.html
├── blog/
│   └── index.html
├── vendors/
│   └── index.html
├── about/
│   └── index.html
├── contact/
│   └── index.html
├── exams.html
├── exam.html
├── css/
│   ├── style.css
│   ├── exams.css
│   └── auth.css
├── js/
│   ├── vendors.js
│   ├── exams.js
│   ├── main.js
│   ├── cart.js
│   ├── supabase.js
│   ├── auth-service.js
│   └── auth-pages.js
├── assets/
│   ├── vendor-logos/
│   └── exam-covers/
├── login/
├── register/
├── forgot-password/
├── dashboard/
└── README.md
```

The homepage is served from `/`, and the Blog, Vendors, About, and Contact pages
are served from `/blog/`, `/vendors/`, `/about/`, and `/contact/`. Their
corresponding root-level `.html` files are retained for compatibility.

## Vendor-specific exam libraries

`js/exams.js` stores the two user-provided AACE International exam records and exposes them as `window.EXAMS`. Each exam has a `vendorId`; `js/main.js` filters by the open vendor ID and renders matching exam cards in that vendor's library modal. Selecting a card opens its cover, exam details, benefits, purchase panel, and shared article in the same modal; it does not navigate to a separate detail page. The article content is editable in the AACE detail section in `vendors.html`.

The detail view's Add to Cart button uses the existing LocalStorage cart. Buy Now and contribution controls display clear integration messages; checkout and article submission are not connected, and no payment or order is created. `exams.html` and `exam.html` are compatibility redirects to the AACE International vendor view; an exam query opens that exam's inline detail view. There is no separate Exam Library navigation item. The counts, prices, and descriptions in the retained exam records are user-provided and not independently verified. Do not treat them as official AACE information.

## Vendor dataset

`js/vendors.js` contains the exact vendor directory list supplied for the website. Keep names, spelling, and intentionally distinct entries unchanged. Each vendor record supports:

- `id`, `name`, and optional `sortName` (for names such as `(ISC)²`)
- `officialUrl` and `libraryUrl` (official certification page; `libraryUrl` is retained for compatibility)
- `logoUrl` and `logoText` (the text label is used when no verified logo image is available)
- `logoSource` and `logoVerifiedOfficial` (branding source metadata; official status is not assumed for third-party brand-mark files)
- `description` and `categories`
- `certifications` (objects with `id`, `name`, optional official exam `code` or `credentialCode`, `description`, `level`, `officialUrl`, `vendorId`, `vendorName`, and `categories`)
- `exams` (demo cart products with `id`, `name`, `price`, and optional `code`)

Certification details and exam codes should be based on the linked official certification page. Use `code` only for an exam code and `credentialCode` for a credential abbreviation; leave either empty when the official page does not identify one. Leave the certification list empty rather than guessing. The category filter uses `window.CERTIFICATION_CATEGORIES` and the category tags on each certification. Vendors without individual records still link to their vendor program catalog.

The directory sorts and renders the vendor list automatically, deduplicating additional vendors by ID and normalized display name. Search includes vendor names and aliases, categories, descriptions, certification names, official exam codes, and demo cart product names/codes. The vendor library's demo cart products are separate from certification and exam listings.

## Login portal

The static routes `/login/`, `/register/`, `/forgot-password/`, and `/dashboard/` use the existing Supabase Auth project through `js/supabase.js` and `js/auth-service.js`. Email/password verification, account creation, and password recovery are handled by Supabase Auth; no passwords are stored by this frontend. Auth sessions use session storage by default, with persistent browser storage only when a user selects **Remember me**.

Enable the Email provider in Supabase Auth and configure the deployed site URL plus redirect URLs for `/login/` and `/forgot-password/` to enable email confirmation and password recovery. The browser key in `js/supabase.js` must remain a Supabase publishable key; never put a service-role or other secret key in frontend code. Add Row Level Security policies for any user data or API access.

The dashboard checks the authenticated Supabase user before rendering account details. Because this project is a static site, its HTML route itself cannot be server-protected; do not put sensitive data in static files. Enforce access to private data with Supabase RLS or a server-side authenticated backend.

## Cart and checkout

The cart supports quantity changes, item removal, subtotal calculation, and browser LocalStorage persistence. Checkout is a frontend demonstration only. It does not process payments or send email. Before accepting orders, implement a secure backend, validate prices server-side, and integrate a trusted payment gateway.

## Notes

- Contact details and legal links are placeholders. Replace them with verified company information.
- The sample exam products and prices are demonstration content, not a representation of official vendor pricing or authorization.
- Bootstrap, Font Awesome, and Google Fonts load from CDNs.
