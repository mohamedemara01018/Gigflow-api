# GigFlow API 🚀

The backend RESTful API and real-time infrastructure powering **GigFlow**, an end-to-end freelance marketplace platform. Built with **Node.js**, **Express.js**, **TypeScript**, and **MongoDB**, this server manages user authentication, contract lifecycles, milestone payments, cloud file uploads, and real-time WebSocket communications.

---

## 🌟 Key Backend Capabilities

* **Authentication & Authorization**: Full JWT-based authentication alongside **Google OAuth** integration, featuring role-based access control (RBAC) for Clients, Freelancers, and Admins.
* **Modular REST API Design**: Dedicated endpoints for users, jobs, proposals, contracts, milestones, conversations, messages, notifications, payments, and identity verification.
* **Database & Data Integrity**: Mongoose schemas designed with partial unique indexing to support nullable Stripe identifiers while strictly enforcing single-payment constraints on contracts.
* **Real-Time Communication**: **Socket.IO** infrastructure powering bi-directional messaging, online status tracking, and instant user notifications.
* **SafePay Escrow & Payments**: **Stripe Connect** workflow integration to hold client funds, calculate platform commission fees, and disburse milestone payouts.
* **Media & Cloud Storage**: **Cloudinary** integration paired with **Multer** for handling user profile pictures, verification documents, and project deliverables.
* **Reliability & Safeguards**: Centralized API error handling middleware and Mongoose connection guards to prevent operation buffering timeouts on cold starts.

---

## 🛠️ Tech Stack

* **Runtime**: Node.js
* **Framework**: Express.js
* **Language**: TypeScript
* **Database & ORM**: MongoDB, Mongoose
* **Real-Time Engine**: Socket.IO
* **Authentication**: JWT, Google OAuth (Passport.js / Google Auth Library)
* **Payments**: Stripe Connect
* **Storage & Uploads**: Cloudinary, Multer
* **Deployment**: Render / Railway (Persistent Server)

---

## 📁 Repository Structure

```text
gigflow-api/
├── src/
│   ├── config/          # Database, Cloudinary, & Stripe configurations
│   ├── controllers/     # Route logic for jobs, proposals, contracts, etc.
│   ├── middlewares/     # JWT Auth, error handling, file uploaders
│   ├── models/          # Mongoose schemas & index definitions
│   ├── routes/          # Express route declarations
│   ├── services/        # Third-party integrations (Stripe, Cloudinary)
│   ├── sockets/         # Socket.IO connection & event handlers
│   ├── utils/           # Helper functions & API response formatters
│   └── index.ts         # Application entry point & server initializers
├── .env.example
├── package.json
└── tsconfig.json
