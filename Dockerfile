# Stage 1: Builder
FROM alpine:3.20 AS builder

# Install build dependencies
# We need build-base (gcc/g++), rust/cargo (for html5ever), clang, and other tools.
RUN apk add --no-cache \
    curl \
    git \
    make \
    build-base \
    rust \
    cargo \
    xz \
    upx \
    clang \
    pkgconfig \
    glib-dev \
    linux-headers

# Install Zig 0.15.2 (latest 0.15.x as requested)
RUN curl -L https://ziglang.org/download/0.15.2/zig-linux-x86_64-0.15.2.tar.xz | tar -xJ -C /usr/local --strip-components=1

# Clone Lightpanda repository
WORKDIR /src
RUN git clone --depth 1 https://github.com/lightpanda-io/browser.git .

# Build Lightpanda
# 1. Download prebuilt V8 to avoid long build times and ensure compatibility.
RUN make download-v8

# 2. Build the binary with ReleaseFast optimization and static linking via musl target.
# We use the prebuilt V8 path downloaded by 'make download-v8'.
# Setting -Dtarget=x86_64-linux-musl ensures we get a statically linked binary on Alpine.
RUN V8_ARCHIVE=$(ls .lp-cache/prebuilt-v8/libc_v8_*.a) && \
    make build ZIGFLAGS="-Dtarget=x86_64-linux-musl -Dprebuilt_v8_path=$V8_ARCHIVE"

# 3. Strip and compress the binary to stay well under the 50MB limit.
# UPX with --lzma provides the best compression ratio.
RUN strip zig-out/bin/lightpanda && \
    upx --best --lzma zig-out/bin/lightpanda

# Stage 2: Final production image
FROM alpine:3.20

# Install minimal runtime dependencies.
# Although statically linked, ca-certificates are needed for HTTPS requests.
RUN apk add --no-cache ca-certificates

# Create a non-root user for security (production-ready requirement).
RUN addgroup -S lightpanda && adduser -S lightpanda -G lightpanda

# Copy the ultra-minimal binary from the builder stage.
COPY --from=builder /src/zig-out/bin/lightpanda /usr/local/bin/lightpanda

# Copy the serverless-optimized entrypoint script.
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Switch to non-root user for high-security environments.
USER lightpanda
WORKDIR /home/lightpanda

# Expose the internal CDP socket port.
EXPOSE 9222

# Ensure fast startup (<100ms) by using a direct entrypoint.
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
