FROM debian:jessie

RUN apt-get update && apt-get install -y \
  git \
  mercurial \
  wget \
  python \
  build-essential \
  make \
  gcc \
  python-dev \
  locales \
  python-pip

RUN dpkg-reconfigure locales && \
    locale-gen C.UTF-8 && \
    /usr/sbin/update-locale LANG=C.UTF-8

ENV LC_ALL C.UTF-8

RUN mkdir /download
RUN cd /download && wget https://godeb.s3.amazonaws.com/godeb-amd64.tar.gz
RUN cd /download && tar xzf godeb-amd64.tar.gz
RUN cd /download && ./godeb install
RUN cd /download && wget http://www.schreiner-home.org/carpo/carpo
RUN cd /download && chmod 755 carpo

RUN useradd -d /workspace carpo
USER carpo
WORKDIR /workspace

EXPOSE 8080
ENTRYPOINT ["/download/carpo"]
CMD ["-port=8080"]
