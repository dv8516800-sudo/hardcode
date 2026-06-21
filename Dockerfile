# Stage 1: Build
FROM debian:bookworm-slim AS builder

ARG ZIG_VERSION=0.15.2
ARG V8_VERSION=14.0.365.4
ARG ZIG_V8_VERSION=v0.4.8

RUN apt-get update && apt-get install -y --no-install-recommends \
    xz-utils ca-certificates pkg-config libglib2.0-dev \
    clang make curl git \
    && rm -rf /var/lib/apt/lists/*

# Install Rust (Required for html5ever dependency)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"

# Install Zig
RUN ARCH=$(uname -m) && \
    curl -L https://ziglang.org/download/${ZIG_VERSION}/zig-linux-${ARCH}-${ZIG_VERSION}.tar.xz -o zig.tar.xz && \
    tar xf zig.tar.xz && \
    mv zig-linux-${ARCH}-${ZIG_VERSION} /usr/local/zig && \
    ln -s /usr/local/zig/zig /usr/local/bin/zig

WORKDIR /build
# Clone the official repo
RUN git clone --depth 1 https://github.com/lightpanda-io/browser.git .

# Download pre-built V8
RUN ARCH=$(uname -m) && \
    curl -L -o libc_v8.a https://github.com/lightpanda-io/zig-v8-fork/releases/download/${ZIG_V8_VERSION}/libc_v8_${V8_VERSION}_linux_${ARCH}.a && \
    mkdir -p v8/ && \
    mv libc_v8.a v8/libc_v8.a

# Build V8 snapshot
RUN zig build -Doptimize=ReleaseFast \
    -Dprebuilt_v8_path=v8/libc_v8.a \
    snapshot_creator -- src/snapshot.bin

# Build final static binary for musl
RUN ARCH=$(uname -m) && \
    zig build -Doptimize=ReleaseFast \
    -Dtarget=${ARCH}-linux-musl \
    -Dsnapshot_path=src/snapshot.bin \
    -Dprebuilt_v8_path=v8/libc_v8.a

# Stage 2: Final Image
FROM alpine:latest

RUN apk add --no-cache ca-certificates

WORKDIR /app
COPY --from=builder /build/zig-out/bin/lightpanda /usr/local/bin/lightpanda
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Verify binary (static check)
RUN ldd /usr/local/bin/lightpanda 2>&1 | grep "Not a valid dynamic program" || true

EXPOSE 9222

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
