FROM ubuntu

RUN apt-get -y update && apt-get install -y \
  git \
  mercurial \
  bzr \
  wget \
  python \
  build-essential \
  make \
  gcc \
  python-dev \
  locales \
  python-pip \
  zip 

ENV LC_ALL C.UTF-8

RUN mkdir /download
RUN cd /download && wget https://godeb.s3.amazonaws.com/godeb-amd64.tar.gz
RUN cd /download && tar xzf godeb-amd64.tar.gz
RUN cd /download && ./godeb install 1.2.1

RUN useradd -d /carpo carpo
RUN mkdir /workspace
RUN mkdir -p /work/src/github.com/ulrichSchreiner/ /work/pkg /work/bin
RUN chown carpo:carpo /workspace
RUN chown -R carpo:carpo /work
WORKDIR /work
USER carpo
ENV GOPATH /work
RUN go get code.google.com/p/go.net/websocket && \ 
  go get github.com/emicklei/go-restful && \
  go get github.com/ulrichSchreiner/gdbmi && \
  go get github.com/jayschwa/go-pty && \
  go get launchpad.net/loggo

RUN cd src/github.com/ulrichSchreiner && git clone https://github.com/ulrichSchreiner/carpo.git
RUN cd src/github.com/ulrichSchreiner/carpo/qx/carpo/source && git clone https://github.com/qooxdoo/qooxdoo.git 
RUN cd src/github.com/ulrichSchreiner/carpo/qx/carpo/source/qooxdoo && git checkout branch_3_0_x
RUN cd src/github.com/ulrichSchreiner/carpo/cmd && ./createdist

WORKDIR /workspace
RUN mkdir -p .carpoplugins/src .carpoplugins/bin .carpoplugins/pkg
ENV GOPATH /workspace/.carpoplugins
RUN go get -u github.com/nsf/gocode

ENV GOPATH /workspace
VOLUME ["/workspace"]
EXPOSE 8080
ENTRYPOINT ["/work/src/github.com/ulrichSchreiner/carpo/cmd/dist/carpo"]
CMD ["-port=8080"]
