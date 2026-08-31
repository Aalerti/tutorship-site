FROM ubuntu:22.04 AS build

ARG HUGO_VERSION=0.148.2
ARG HUGO_BASEURL=http://se-tutorship.ru
ARG TUTORSHIP_API_BASE=

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl tar \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /tutorsite

RUN curl -sSL -o hugo.tar.gz \
      "https://github.com/gohugoio/hugo/releases/download/v${HUGO_VERSION}/hugo_extended_withdeploy_${HUGO_VERSION}_Linux-64bit.tar.gz" \
 && tar -xzf hugo.tar.gz \
 && rm hugo.tar.gz

COPY . .

ENV HUGO_PARAMS_APIBASE=${TUTORSHIP_API_BASE}
RUN ./hugo --gc --minify --baseURL "${HUGO_BASEURL}"

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /tutorsite/public /usr/share/nginx/html

EXPOSE 80
