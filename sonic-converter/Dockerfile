# Stage 1: Build the Rust binary
FROM rust:1.82-slim AS builder

RUN apt-get update && apt-get install -y pkg-config && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src/ src/

RUN cargo build --bin sonic-server --features server --release

# Stage 2: Minimal runtime image
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/sonic-server /usr/local/bin/sonic-server

ENV SONIC_ADDR=0.0.0.0:3001
EXPOSE 3001

CMD ["sonic-server"]
